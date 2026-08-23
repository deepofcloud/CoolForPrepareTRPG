﻿/* ==========================================================================
 * 状态管理模块
 * 管理全局应用状态，包括当前页面、模组列表、当前模组数据
 * ========================================================================== */
const AppState = {
  _isBoardIframe: (typeof window !== 'undefined' && window.__APP_MODE__) === 'board',
  _isDocIframe: (typeof window !== 'undefined' && window.__APP_MODE__) === 'editor',
  currentPage: (typeof window !== 'undefined' && window.__APP_MODE__) || 'home',
  modules: [],               // 模组列表
  currentModuleId: null,     // 当前打开的模组 ID
  currentModule: null,      // 当前模组数据（完整对象）
  workDirHandle: null,       // File System Access API 的工作目录句柄
  useFileSystemAPI: false,    // 是否使用 File System Access API
  pendingDocFile: null,       // 待导入的文档文件名
  pendingDocType: null,       // 文档类型：'pdf' | 'docx'
  confirmCallback: null,      // 确认对话框的回调函数
  placedEntryIds: new Set(),  // 已放置到带团板的数据库条目 ID 集合

  /* 模组图标池 */
  moduleIconPool: ['i-castle','i-dragon','i-sword','i-scroll','i-map','i-dice','i-shield','i-skull','i-spider','i-book','i-book-open','i-star','i-flag','i-trophy','i-sun'],
  /* 模组英文副标题池 */
  moduleSubtitlePool: ['DARK DUNGEON','EPIC QUEST','LOST REALM','SHADOW KEEP','DRAGON LAIR','MYSTIC TOWER','ANCIENT RUINS','CURSED LANDS','HIDDEN TOMB','DEEP FOREST','STORM COAST','IRON CITADEL','SILENT CHAPEL','GOLDEN THRONE'],

  /* 创建空模组数据 */
  createEmptyModule(name, system) {
    const now = new Date().toISOString();
    
    const dbConfig = SystemManager.getDbConfig(system);
    const databases = {};
    databases['1号库'] = {};
    for (const key of Object.keys(dbConfig)) {
      databases['1号库'][key] = [];
    }
    
    return {
      id: this.generateUUID(),
      name: name,
      system: system,
      createdAt: now,
      updatedAt: now,
      status: 'draft',  // draft / active / completed
      pdfFileName: null,
      document: { pages: [], rawText: '' },
      databases: databases,
      customDbTypes: {},
      hiddenDbTypes: [],
      board: { flowUnits: [], connections: [], unitType: 'scene', battleDeployments: [], worldTime: { time: 480, day: 1, logs: [], expanded: false } },
      subtitle: this.moduleSubtitlePool[Math.floor(Math.random() * this.moduleSubtitlePool.length)]
    };
  },

  /* 生成 UUID */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  /* 根据 ID 查找模组 */
  findModule(id) {
    return this.modules.find(m => m.id === id);
  },

  /* 格式化时间 */
  formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  /* 获取状态中文名 */
  getStatusLabel(status) {
    const map = { draft: '草稿', active: '进行中', completed: '已完成' };
    return map[status] || '草稿';
  },

  /* 获取状态 CSS 类名 */
  getStatusClass(status) {
    const map = { draft: 'draft', active: 'active', completed: 'completed' };
    return map[status] || 'draft';
  },

  /* 获取模组图标 ID（根据索引循环分配） */
  getModuleIcon(index) {
    const icons = ['i-castle', 'i-dragon', 'i-sword', 'i-scroll', 'i-map', 'i-dice', 'i-shield', 'i-star'];
    return icons[index % icons.length];
  }
};

/* ==========================================================================
 * 系统配置管理模块
 * 管理不同规则书系统的配置和数据获取
 * ========================================================================== */
const SystemManager = {
  SYSTEMS: {
    dnd5r: { name: 'D&D 5R', desc: '龙与地下城第五版修订版规则' },
    coc7: { name: 'COC 7th', desc: '克苏鲁的呼唤第七版规则' },
    custom: { name: '自定义', desc: '自定义规则书，可自由编辑结构' }
  },

  getDbConfig(system) {
    return DatabaseManager.DB_CONFIG;
  },

  getRulebookData(system) {
    if (system === 'custom') {
      return RulebookManager.data || {};
    }
    return RulebookManager.data || {};
  },

  getCurrentSystem() {
    const mod = AppState.currentModule;
    if (!mod || !mod.system) return 'dnd5r';
    return mod.system;
  },

  getSystemInfo(system) {
    return this.SYSTEMS[system] || this.SYSTEMS.dnd5r;
  }
};

/* ==========================================================================
 * 角色模板管理模块
 * 管理自定义规则书的角色模板（属性和栏位配置）
 * ========================================================================== */
const CharTemplateManager = {
  _currentTab: 'properties',
  _selectedIcon: 'i-star',

  getTemplate() {
    const mod = AppState.currentModule;
    if (!mod) return { properties: [], sections: [] };
    if (!mod.charTemplate) {
      mod.charTemplate = { properties: [], sections: [] };
    }
    return mod.charTemplate;
  },

  isCustomSystem() {
    return SystemManager.getCurrentSystem() !== 'dnd5r';
  },

  openModal() {
    if (!this.isCustomSystem()) {
      DocEditor.showToast('D&D 5R 规则书不支持自定义模板', 'error');
      return;
    }
    const modal = document.getElementById('charTemplateModal');
    if (!modal) return;
    this._currentTab = 'properties';
    this._renderList();
    this._updateTabState();
    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('charTemplateModal');
    if (modal) modal.classList.remove('active');
  },

  switchTab(tab) {
    this._currentTab = tab;
    this._updateTabState();
    this._renderList();
  },

  _updateTabState() {
    document.querySelectorAll('.ct-tab').forEach(el => {
      if (el.dataset.tab === this._currentTab) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
    const propList = document.getElementById('ctPropertiesList');
    const secList = document.getElementById('ctSectionsList');
    if (propList) propList.style.display = this._currentTab === 'properties' ? 'block' : 'none';
    if (secList) secList.style.display = this._currentTab === 'sections' ? 'block' : 'none';
  },

  _renderList() {
    const tpl = this.getTemplate();
    const list = this._currentTab === 'properties'
      ? document.getElementById('ctPropertiesList')
      : document.getElementById('ctSectionsList');
    if (!list) return;

    const items = this._currentTab === 'properties' ? tpl.properties : tpl.sections;

    if (items.length === 0) {
      const typeLabel = this._currentTab === 'properties' ? '属性' : '栏位';
      list.innerHTML = `
        <div class="ct-empty">
          <span class="icon"><svg><use href="#i-folder"/></svg></span>
          <div>暂无${typeLabel}</div>
          <div style="font-size:11px;opacity:0.7;">点击下方「添加」按钮创建第一个${typeLabel}</div>
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach((item, idx) => {
      html += `
        <div class="ct-item" data-id="${item.id}">
          <div class="ct-item-icon">
            <svg><use href="#${item.icon}"/></svg>
          </div>
          <span class="ct-item-name">${this._esc(item.name)}</span>
          <div class="ct-item-actions">
            <button class="ct-item-btn" onclick="CharTemplateManager.moveItem('${item.id}', -1)" title="上移" ${idx === 0 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>
              <svg><use href="#i-chevron-u"/></svg>
            </button>
            <button class="ct-item-btn" onclick="CharTemplateManager.moveItem('${item.id}', 1)" title="下移" ${idx === items.length - 1 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>
              <svg><use href="#i-chevron-d"/></svg>
            </button>
            <button class="ct-item-btn delete" onclick="CharTemplateManager.confirmRemoveItem('${item.id}')" title="删除">
              <svg><use href="#i-trash"/></svg>
            </button>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;
  },

  _esc(v) {
    const d = document.createElement('div');
    d.textContent = v || '';
    return d.innerHTML;
  },

  showAddDialog() {
    const modal = document.getElementById('ctAddItemModal');
    if (!modal) return;
    const title = document.getElementById('ctAddItemTitle');
    const nameInput = document.getElementById('ctItemName');
    if (title) title.textContent = this._currentTab === 'properties' ? '添加属性' : '添加栏位';
    if (nameInput) nameInput.value = '';
    this._selectedIcon = this._currentTab === 'properties' ? 'i-target' : 'i-list';
    this._renderIconPicker();
    modal.classList.add('active');
  },

  closeAddDialog() {
    const modal = document.getElementById('ctAddItemModal');
    if (modal) modal.classList.remove('active');
  },

  _renderIconPicker() {
    const list = document.getElementById('ctIconList');
    if (!list) return;
    const icons = DatabaseManager._availableIcons;
    let html = '';
    for (const iconId of icons) {
      const selected = iconId === this._selectedIcon ? 'selected' : '';
      html += `<div class="icon-item ${selected}" data-icon="${iconId}" onclick="CharTemplateManager._selectIcon('${iconId}')">`;
      html += `<svg><use href="#${iconId}"/></svg>`;
      html += `</div>`;
    }
    list.innerHTML = html;

    const container = list.parentElement;
    if (container && !container._bound) {
      container._bound = true;
      let isDragging = false;
      let startX = 0;
      let scrollLeft = 0;
      container.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
      });
      container.addEventListener('mouseleave', () => { isDragging = false; });
      container.addEventListener('mouseup', () => { isDragging = false; });
      container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        container.scrollLeft = scrollLeft - (x - startX) * 1.5;
      });
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }, { passive: false });
    }
  },

  _selectIcon(iconId) {
    this._selectedIcon = iconId;
    this._renderIconPicker();
  },

  confirmAddItem() {
    const nameInput = document.getElementById('ctItemName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      DocEditor.showToast('请输入名称', 'error');
      return;
    }
    const tpl = this.getTemplate();
    const id = (this._currentTab === 'properties' ? 'p_' : 's_') + Date.now();
    const newItem = { id, name, icon: this._selectedIcon };
    if (this._currentTab === 'properties') {
      tpl.properties.push(newItem);
    } else {
      tpl.sections.push(newItem);
    }
    StorageManager.scheduleSave();
    this._renderList();
    this.closeAddDialog();
    if (typeof CharAlbum !== 'undefined' && CharAlbum._currentCharacterId) {
      CharAlbum.renderCharacterDetail(CharAlbum._currentCharacterId);
    }
    DocEditor.showToast(`已添加${this._currentTab === 'properties' ? '属性' : '栏位'}「${name}」`, 'success');
  },

  moveItem(id, direction) {
    const tpl = this.getTemplate();
    const arr = this._currentTab === 'properties' ? tpl.properties : tpl.sections;
    const idx = arr.findIndex(x => x.id === id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    StorageManager.scheduleSave();
    this._renderList();
    if (typeof CharAlbum !== 'undefined' && CharAlbum._currentCharacterId) {
      CharAlbum.renderCharacterDetail(CharAlbum._currentCharacterId);
    }
  },

  confirmRemoveItem(id) {
    const tpl = this.getTemplate();
    const arr = this._currentTab === 'properties' ? tpl.properties : tpl.sections;
    const item = arr.find(x => x.id === id);
    if (!item) return;
    const typeLabel = this._currentTab === 'properties' ? '属性' : '栏位';

    let affectedCount = 0;
    const mod = AppState.currentModule;
    if (mod && mod.board && mod.board.flowUnits) {
      mod.board.flowUnits.forEach(unit => {
        if (!unit.notes) return;
        unit.notes.forEach(note => {
          if (note.type === 'characters' && note.characterData && note.characterData.fields) {
            const f = note.characterData.fields;
            if (this._currentTab === 'properties') {
              if (f._props && f._props[id]) affectedCount++;
            } else {
              if (f._sections && f._sections[id]) affectedCount++;
            }
          }
        });
      });
    }

    const msg = affectedCount > 0
      ? `确定要删除${typeLabel}「${item.name}」吗？当前有 ${affectedCount} 个角色使用了该${typeLabel}，数据将被清除。`
      : `确定要删除${typeLabel}「${item.name}」吗？`;

    App.showConfirm('确认删除', msg, '删除', () => {
      this.removeItem(id);
    });
  },

  removeItem(id) {
    const tpl = this.getTemplate();
    const arr = this._currentTab === 'properties' ? tpl.properties : tpl.sections;
    const idx = arr.findIndex(x => x.id === id);
    if (idx === -1) return;
    arr.splice(idx, 1);

    const mod = AppState.currentModule;
    if (mod && mod.board && mod.board.flowUnits) {
      mod.board.flowUnits.forEach(unit => {
        if (!unit.notes) return;
        unit.notes.forEach(note => {
          if (note.type === 'characters' && note.characterData && note.characterData.fields) {
            const f = note.characterData.fields;
            if (this._currentTab === 'properties') {
              if (f._props) delete f._props[id];
            } else {
              if (f._sections) delete f._sections[id];
            }
          }
        });
      });
    }

    StorageManager.scheduleSave();
    this._renderList();
    if (typeof CharAlbum !== 'undefined' && CharAlbum._currentCharacterId) {
      CharAlbum.renderCharacterDetail(CharAlbum._currentCharacterId);
    }
    DocEditor.showToast('已删除', 'success');
  }
};

/* ==================== COC 7th 辅助函数 ==================== */

/** COC 7th 默认技能列表（基础值） */
const COC_DEFAULT_SKILLS = [
  { name: '会计', base: 5, occ: 0, int: 0, growth: false },
  { name: '人类学', base: 1, occ: 0, int: 0, growth: false },
  { name: '估价', base: 5, occ: 0, int: 0, growth: false },
  { name: '考古学', base: 1, occ: 0, int: 0, growth: false },
  { name: '技艺①', base: 5, occ: 0, int: 0, growth: false },
  { name: '技艺②', base: 5, occ: 0, int: 0, growth: false },
  { name: '技艺③', base: 5, occ: 0, int: 0, growth: false },
  { name: '魅惑', base: 15, occ: 0, int: 0, growth: false },
  { name: '攀爬', base: 20, occ: 0, int: 0, growth: false },
  { name: '计算机使用', base: 5, occ: 0, int: 0, growth: false },
  { name: '信用评级', base: 0, occ: 0, int: 0, growth: false },
  { name: '克苏鲁神话', base: 0, occ: 0, int: 0, growth: false },
  { name: '乔装', base: 5, occ: 0, int: 0, growth: false },
  { name: '闪避', base: 32, occ: 0, int: 0, growth: false },
  { name: '汽车驾驶', base: 20, occ: 0, int: 0, growth: false },
  { name: '电气维修', base: 10, occ: 0, int: 0, growth: false },
  { name: '电子学', base: 1, occ: 0, int: 0, growth: false },
  { name: '话术', base: 5, occ: 0, int: 0, growth: false },
  { name: '格斗(斗殴)', base: 25, occ: 0, int: 0, growth: false },
  { name: '格斗①', base: 0, occ: 0, int: 0, growth: false },
  { name: '格斗②', base: 0, occ: 0, int: 0, growth: false },
  { name: '格斗③', base: 0, occ: 0, int: 0, growth: false },
  { name: '射击(手枪)', base: 20, occ: 0, int: 0, growth: false },
  { name: '射击①', base: 0, occ: 0, int: 0, growth: false },
  { name: '射击②', base: 0, occ: 0, int: 0, growth: false },
  { name: '射击③', base: 0, occ: 0, int: 0, growth: false },
  { name: '急救', base: 30, occ: 0, int: 0, growth: false },
  { name: '历史', base: 5, occ: 0, int: 0, growth: false },
  { name: '恐吓', base: 15, occ: 0, int: 0, growth: false },
  { name: '跳跃', base: 20, occ: 0, int: 0, growth: false },
  { name: '外语①', base: 1, occ: 0, int: 0, growth: false },
  { name: '外语②', base: 1, occ: 0, int: 0, growth: false },
  { name: '外语③', base: 1, occ: 0, int: 0, growth: false },
  { name: '母语', base: 0, occ: 0, int: 0, growth: false },
  { name: '法律', base: 5, occ: 0, int: 0, growth: false },
  { name: '图书馆使用', base: 20, occ: 0, int: 0, growth: false },
  { name: '聆听', base: 20, occ: 0, int: 0, growth: false },
  { name: '锁匠', base: 1, occ: 0, int: 0, growth: false },
  { name: '机械维修', base: 10, occ: 0, int: 0, growth: false },
  { name: '医学', base: 1, occ: 0, int: 0, growth: false },
  { name: '博物学', base: 10, occ: 0, int: 0, growth: false },
  { name: '领航', base: 10, occ: 0, int: 0, growth: false },
  { name: '神秘学', base: 5, occ: 0, int: 0, growth: false },
  { name: '操作重型机械', base: 1, occ: 0, int: 0, growth: false },
  { name: '说服', base: 10, occ: 0, int: 0, growth: false },
  { name: '精神分析', base: 1, occ: 0, int: 0, growth: false },
  { name: '心理学', base: 10, occ: 0, int: 0, growth: false },
  { name: '骑术', base: 5, occ: 0, int: 0, growth: false },
  { name: '科学①', base: 1, occ: 0, int: 0, growth: false },
  { name: '科学②', base: 1, occ: 0, int: 0, growth: false },
  { name: '科学③', base: 1, occ: 0, int: 0, growth: false },
  { name: '潜行', base: 20, occ: 0, int: 0, growth: false },
  { name: '侦察', base: 25, occ: 0, int: 0, growth: false },
  { name: '游泳', base: 20, occ: 0, int: 0, growth: false },
  { name: '驯兽', base: 5, occ: 0, int: 0, growth: false },
  { name: '投掷', base: 20, occ: 0, int: 0, growth: false },
  { name: '追踪', base: 10, occ: 0, int: 0, growth: false },
  { name: '导航', base: 10, occ: 0, int: 0, growth: false },
  { name: '生存', base: 10, occ: 0, int: 0, growth: false },
  { name: '武术', base: 1, occ: 0, int: 0, growth: false },
  { name: '爆破', base: 1, occ: 0, int: 0, growth: false },
  { name: '读唇', base: 1, occ: 0, int: 0, growth: false },
  { name: '催眠', base: 1, occ: 0, int: 0, growth: false },
  { name: '炮术', base: 1, occ: 0, int: 0, growth: false }
];

/** 计算COC伤害加值 (STR+SIZ) */
function _cocCalcDB(str, siz) {
  const t = (parseInt(str) || 0) + (parseInt(siz) || 0);
  if (t <= 64) return { db: '-2', build: -2 };
  if (t <= 84) return { db: '-1', build: -1 };
  if (t <= 124) return { db: '0', build: 0 };
  if (t <= 164) return { db: '+1D4', build: 1 };
  if (t <= 204) return { db: '+1D6', build: 2 };
  if (t <= 284) return { db: '+2D6', build: 3 };
  if (t <= 364) return { db: '+3D6', build: 4 };
  return { db: '+4D6', build: 5 };
}

/** 判断COC技能是否为可自定义词缀的模板技能 */
function _isCocTemplateSkill(name) {
  return /^(格斗|射击|科学|技艺|外语)[①②③]$/.test(name) || name === '生存';
}

/** 获取COC技能显示名（模板技能+suffix → "格斗(短刀)"） */
function _cocSkillDisplayName(sk) {
  if (sk.suffix) {
    const base = sk.name.replace(/[①②③]$/, '');
    if (sk.suffix !== base) return base + '(' + sk.suffix + ')';
  }
  return sk.name;
}

/** 创建COC 7th角色默认数据 */
function _createCocCharacterData() {
  return {
    _coc7: true,
    name: '新角色',
    player: '', occupation: '', age: '', gender: '', era: '', residence: '', birthplace: '',
    attributes: {
      str: { name: '力量', value: 0 }, con: { name: '体质', value: 0 },
      siz: { name: '体型', value: 0 }, dex: { name: '敏捷', value: 0 },
      app: { name: '外貌', value: 0 }, int: { name: '智力', value: 0 },
      pow: { name: '意志', value: 0 }, edu: { name: '教育', value: 0 }
    },
    hp: { current: 0, max: 0 },
    san: { current: 0, max: 0 },
    luck: { current: 0, max: 99 },
    mp: { current: 0, max: 0 },
    armor: 0, mov: 0,
    skills: COC_DEFAULT_SKILLS.map(s => ({ ...s })),
    weapons: [],
    inventory: [],
    insanityEffects: [],
    backstory: '',
    ideas: '', importantPeople: '', meaningfulPlace: '', treasuredItem: '', trait: '', fear: ''
  };
}

/* ==========================================================================
 * 规则书管理模块
 * 管理 D&D 5R 规则书数据的加载、索引和搜索
 * ========================================================================== */
const RulebookManager = {
  system: 'dnd5r',   // 标记：此规则书库归属于 D&D 5R 系统
  data: null,
  index: null,
  loaded: false,
  loading: false,

  async init() {
    if (this.loaded || this.loading) return;
    this.loading = true;
    try {
      const response = await fetch('dnd5r_rules.json');
      if (!response.ok) throw new Error('规则书文件加载失败');
      this.data = await response.json();
      this._buildIndex();
      this.loaded = true;
      console.log('[Rulebook] 规则书加载完成，条目数:', this._getTotalCount());
    } catch (e) {
      console.error('[Rulebook] 规则书加载失败:', e);
      this.data = {
        version: '1.0',
        spells: [],
        monsters: [],
        weapons: [],
        armor: [],
        equipment: [],
        feats: [],
        magicItems: [],
        rules: [],
        races: [],
        classes: []
      };
      this._buildIndex();
      this.loaded = true;
    }
    this.loading = false;
  },

  _buildIndex() {
    this.index = {};
    const types = ['spells', 'monsters', 'weapons', 'armor', 'equipment', 'feats', 'magicItems', 'rules', 'races', 'classes'];
    
    types.forEach(type => {
      const items = this.data[type] || [];
      items.forEach(item => {
        const keywords = this._extractKeywords(item);
        keywords.forEach(keyword => {
          if (!this.index[keyword]) this.index[keyword] = [];
          this.index[keyword].push({ type, item });
        });
      });
    });
  },

  _extractKeywords(item) {
    const text = [
      item.name,
      item.englishName,
      item.description,
      item.category,
      item.type,
      item.rarity,
      item.prerequisite,
      JSON.stringify(item.statBlock)
    ].filter(Boolean).join(' ').toLowerCase();
    
    const words = new Set();
    const regex = /[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      words.add(match[0]);
    }
    return Array.from(words);
  },

  _getTotalCount() {
    return Object.values(this.data).filter(Array.isArray).reduce((sum, arr) => sum + arr.length, 0);
  },

  search(query) {
    if (!this.loaded || !query.trim()) return [];
    
    const q = query.trim().toLowerCase();
    const results = [];
    const seen = new Set();

    const types = ['spells', 'monsters', 'weapons', 'armor', 'equipment', 'feats', 'magicItems', 'rules', 'races', 'classes'];
    
    types.forEach(type => {
      const items = this.data[type] || [];
      items.forEach(item => {
        const id = item.id;
        if (seen.has(id)) return;
        
        const text = [
          item.name,
          item.englishName,
          item.description,
          item.category,
          item.type,
          item.rarity,
          item.prerequisite,
          JSON.stringify(item.statBlock)
        ].filter(Boolean).join(' ').toLowerCase();
        
        if (text.includes(q)) {
          seen.add(id);
          let score = 0;
          if (item.name.toLowerCase().includes(q)) score += 10;
          if (item.englishName && item.englishName.toLowerCase().includes(q)) score += 5;
          if (item.category && item.category.toLowerCase().includes(q)) score += 3;
          if (text.includes(q)) score += 1;
          
          results.push({
            type: type,
            item: item,
            score: score,
            matchText: item.name
          });
        }
      });
    });

    return results.sort((a, b) => b.score - a.score);
  },

  getItemById(id) {
    const types = ['spells', 'monsters', 'weapons', 'armor', 'equipment', 'feats', 'magicItems', 'rules', 'races', 'classes'];
    for (const type of types) {
      const items = this.data[type] || [];
      const found = items.find(item => item.id === id);
      if (found) return { type, item: found };
    }
    return null;
  },

  getTypeLabel(type) {
    const labels = {
      spells: '法术',
      monsters: '怪物',
      weapons: '武器',
      armor: '护甲',
      equipment: '装备',
      feats: '专长',
      magicItems: '魔法物品',
      rules: '规则说明',
      races: '种族',
      classes: '职业'
    };
    return labels[type] || type;
  },

  getTypeIcon(type) {
    const icons = {
      spells: '🧪',
      monsters: '👹',
      weapons: '⚔️',
      armor: '🛡️',
      equipment: '📦',
      feats: '⭐',
      magicItems: '✨',
      rules: '📖',
      races: '🧬',
      classes: '🎭'
    };
    return icons[type] || '📄';
  },

  getSpellsByLevel(level) {
    return (this.data.spells || []).filter(s => s.level === level);
  },

  getMonstersByCategory(category) {
    return (this.data.monsters || []).filter(m => m.category === category);
  }
};

/* ==========================================================================
 * 主题管理模块
 * 支持暖羊皮纸（默认）和暗夜森林两套主题
 * ========================================================================== */
const ThemeManager = {
  STORAGE_KEY: 'cfpt-theme',
  currentTheme: 'default',

  init() {
    // 从 localStorage 恢复主题
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved && saved !== 'default') {
      this.setTheme(saved, true);
    } else {
      this.currentTheme = 'default';
      this._updateUI();
    }
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      const switcher = document.getElementById('themeSwitcher');
      const dropdown = document.getElementById('themeDropdown');
      if (switcher && dropdown && !switcher.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  },

  toggleDropdown() {
    const dropdown = document.getElementById('themeDropdown');
    if (dropdown) dropdown.classList.toggle('open');
  },

  setTheme(themeName, isInit = false) {
    const body = document.body;
    if (themeName === 'default') {
      body.removeAttribute('data-theme');
    } else {
      body.setAttribute('data-theme', themeName);
    }
    this.currentTheme = themeName;
    localStorage.setItem(this.STORAGE_KEY, themeName);

    // 切换时添加过渡动画（初始化时不添加，避免页面加载闪烁）
    if (!isInit) {
      body.classList.add('theme-transitioning');
      setTimeout(() => body.classList.remove('theme-transitioning'), 500);
    }

    this._updateUI();
  },

  _updateUI() {
    // 更新下拉菜单中的选中状态
    const options = document.querySelectorAll('.theme-option');
    options.forEach(opt => {
      const val = opt.getAttribute('data-theme-value');
      opt.classList.toggle('active', val === this.currentTheme);
    });
  }
};

// 尽早初始化主题（避免闪烁）
ThemeManager.init();

/* ==========================================================================
 * 存档管理模块
 * 支持 File System Access API（Chrome/Edge）和 localStorage（Firefox/Safari）
 * ========================================================================== */
const StorageManager = {
  LS_KEY_MODULES: 'gm-assistant-modules',
  LS_KEY_WORKDIR: 'gm-assistant-workdir',
  saveTimer: null,

  /* 初始化：检测 API 支持并恢复数据 */
  async init() {
    // 分屏模式下，iframe 中 electronAPI 不可用，强制走 localStorage 兜底
    if (AppState._isBoardIframe || AppState._isDocIframe) {
      this.loadModulesFromLocalStorage();
      const savedWorkDir = localStorage.getItem('gm-assistant-workdir');
      if (savedWorkDir) {
        AppState.workDirPath = savedWorkDir;
      }
      if (typeof TutorialManager !== 'undefined' && TutorialManager._checkShowStartPrompt) {
        TutorialManager._checkShowStartPrompt();
      }
      const currentModuleId = localStorage.getItem('gm-assistant-current-module-id');
      if (currentModuleId && AppState.modules) {
        const mod = AppState.modules.find(m => m.id === currentModuleId);
        if (mod) {
          AppState.currentModuleId = currentModuleId;
          AppState.currentModule = mod;
          if (typeof App !== 'undefined' && App.openModule) {
            App.openModule(currentModuleId);
          }
        }
      }
      UIRender.renderModuleList();
      return;
    }
    // Electron 原生方案（优先级最高）
    if (window.electronAPI) {
      const lastDir = await window.electronAPI.getLastDir();
      if (lastDir && await window.electronAPI.checkDir(lastDir)) {
        AppState.workDirPath = lastDir;
        AppState.useFileSystemAPI = true;
        this.hideWorkdirPrompt();
        await this.loadModulesFromFileSystem();
      } else {
        this.showWorkdirPrompt();
      }
    } else if (window.showDirectoryPicker) {
      // 浏览器 File System Access API 方案
      AppState.useFileSystemAPI = true;
      const handle = await this.restoreDirHandle();
      if (handle) {
        try {
          const perm = await handle.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted') {
            AppState.workDirHandle = handle;
            await this.loadModulesFromFileSystem();
          } else {
            const req = await handle.requestPermission({ mode: 'readwrite' });
            if (req === 'granted') {
              AppState.workDirHandle = handle;
              await this.loadModulesFromFileSystem();
            } else {
              this.showWorkdirPrompt();
            }
          }
        } catch (e) {
          console.warn('工作目录恢复失败', e);
          this.showWorkdirPrompt();
        }
      } else {
        this.showWorkdirPrompt();
      }
    } else {
      // localStorage 兜底方案
      document.getElementById('noticeBar').classList.remove('hidden');
      document.getElementById('btnExportAll').style.display = '';
      document.getElementById('btnImportAll').style.display = '';
      this.loadModulesFromLocalStorage();
      // 兜底方案无需选择目录，直接检查教学引导
      if (typeof TutorialManager !== 'undefined' && TutorialManager._checkShowStartPrompt) {
        TutorialManager._checkShowStartPrompt();
      }
    }

    // 渲染首页模组列表
    UIRender.renderModuleList();

    // 检查 URL 参数：退出分屏时会带上 ?module=xxx，自动打开对应模组
    const urlParams = new URLSearchParams(window.location.search);
    const urlModuleId = urlParams.get('module');
    if (urlModuleId) {
      const targetMod = AppState.modules.find(m => m.id === urlModuleId);
      if (targetMod && typeof App !== 'undefined' && App.openModule) {
        App.openModule(urlModuleId);
      }
    }
    // 无论是否命中，都隐藏加载遮罩
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  },

  /* 显示工作目录选择提示 */
  showWorkdirPrompt() {
    const el = document.getElementById('workdirPrompt');
    if (el) el.style.display = '';
    const btn = document.getElementById('btnChangeDir');
    if (btn) btn.style.display = 'none';
  },

  /* 隐藏工作目录选择提示 */
  hideWorkdirPrompt() {
    const el = document.getElementById('workdirPrompt');
    if (el) el.style.display = 'none';
    const btn = document.getElementById('btnChangeDir');
    if (btn) btn.style.display = '';
    // 工作目录确定后，检查是否需要显示教学引导
    if (typeof TutorialManager !== 'undefined' && TutorialManager._checkShowStartPrompt) {
      TutorialManager._checkShowStartPrompt();
    }
  },

  /* 检查是否已设置工作目录，未设置则提示用户并返回 false */
  ensureWorkDir() {
    if (AppState.workDirHandle || AppState.workDirPath) return true;
    UIRender.switchPage('home');
    this.showWorkdirPrompt();
    DocEditor.showToast('请先选择工作目录', 'info');
    return false;
  },

  /* 用户选择工作目录 */
  async pickWorkDir() {
    try {
      // Electron 原生方案
      if (window.electronAPI) {
        const dirPath = await window.electronAPI.pickDirectory();
        if (!dirPath) return; // 用户取消
        AppState.workDirPath = dirPath;
        AppState.useFileSystemAPI = true;
        this.hideWorkdirPrompt();
        await this.loadModulesFromFileSystem();
        UIRender.renderModuleList();
        return;
      }
      // 浏览器 File System Access API 方案
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        console.warn('用户未授予目录读写权限');
        this.showWorkdirPrompt();
        return;
      }
      AppState.workDirHandle = handle;
      await this.persistDirHandle(handle);
      this.hideWorkdirPrompt();
      await this.loadModulesFromFileSystem();
      UIRender.renderModuleList();
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('选择工作目录失败', e);
      }
    }
  },

  /* 将目录句柄持久化到 IndexedDB */
  async persistDirHandle(handle) {
    try {
      const db = await this.openIDB();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, 'workdir');
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
      db.close();
    } catch (e) {
      console.warn('持久化目录句柄失败', e);
    }
  },

  /* 从 IndexedDB 恢复目录句柄 */
  async restoreDirHandle() {
    try {
      const db = await this.openIDB();
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const req = store.get('workdir');
      return new Promise((resolve, reject) => {
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      });
    } catch (e) {
      console.warn('恢复目录句柄失败', e);
      return null;
    }
  },

  /* 打开 IndexedDB */
  openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('gm-assistant-db', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /* ========== File System Access API 方案 ========== */

  /* 从文件系统加载模组列表 */
  async loadModulesFromFileSystem() {
    // Electron 原生方案
    if (window.electronAPI && AppState.workDirPath) {
      try {
        AppState.modules = [];
        const files = await window.electronAPI.listJsonFiles(AppState.workDirPath);
        for (const fileName of files) {
          try {
            const text = await window.electronAPI.readFile(
              AppState.workDirPath + '/' + fileName
            );
            if (text) {
              const data = JSON.parse(text);
              if (data && data.id && data.name) {
                if (!data.customDbTypes) data.customDbTypes = {};
                AppState.modules.push(data);
              }
            }
          } catch (e) {
            console.warn(`加载模组文件 ${fileName} 失败`, e);
          }
        }
        AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      } catch (e) {
        console.error('扫描工作目录失败', e);
      }
      return;
    }
    // 浏览器 File System Access API 方案
    if (!AppState.workDirHandle) return;
    try {
      AppState.modules = [];
      for await (const entry of AppState.workDirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const file = await entry.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data && data.id && data.name) {
              if (!data.customDbTypes) data.customDbTypes = {};
              AppState.modules.push(data);
            }
          } catch (e) {
            console.warn(`加载模组文件 ${entry.name} 失败`, e);
          }
        }
      }
      AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (e) {
      console.error('扫描工作目录失败', e);
    }
  },

  /* 保存单个模组到文件系统 */
  async saveModuleToFileSystem(module) {
    // Electron 原生方案
    if (window.electronAPI && AppState.workDirPath) {
      try {
        const fileName = this.getModuleFileName(module);
        const jsonStr = JSON.stringify(module, null, 2);
        const filePath = AppState.workDirPath + '/' + fileName;
        console.log('[saveModuleToFileSystem] Electron 保存:', filePath);
        const ok = await window.electronAPI.writeFile(filePath, jsonStr);
        if (!ok) {
          console.error(`[saveModuleToFileSystem] 保存模组文件 ${fileName} 失败: writeFile 返回 false`);
          throw new Error(`保存模组文件 ${fileName} 失败`);
        }
        console.log('[saveModuleToFileSystem] 保存成功:', fileName);
      } catch (e) {
        console.error(`[saveModuleToFileSystem] 保存模组 ${module.name} 失败`, e);
        throw e;
      }
      return;
    }
    // 浏览器 File System Access API 方案
    if (!AppState.workDirHandle) return;
    try {
      const fileName = this.getModuleFileName(module);
      const jsonStr = JSON.stringify(module, null, 2);
      let fileHandle;
      try {
        fileHandle = await AppState.workDirHandle.getFileHandle(fileName, { create: true });
      } catch (e) {
        console.error(`创建文件 ${fileName} 失败`, e);
        return;
      }
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
      } catch (writeErr) {
        if (writeErr.name === 'InvalidStateError') {
          console.warn(`文件句柄状态过期，重新获取后重试: ${fileName}`);
          fileHandle = await AppState.workDirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonStr);
          await writable.close();
        } else {
          throw writeErr;
        }
      }
    } catch (e) {
      console.error(`保存模组 ${module.name} 失败`, e);
    }
  },

  /* 删除模组文件 */
  async deleteModuleFromFileSystem(module) {
    // Electron 原生方案
    if (window.electronAPI && AppState.workDirPath) {
      try {
        const fileName = this.getModuleFileName(module);
        const filePath = AppState.workDirPath + '/' + fileName;
        await window.electronAPI.deleteFile(filePath);
      } catch (e) {
        console.error(`删除模组文件 ${module.name} 失败`, e);
      }
      return;
    }
    // 浏览器 File System Access API 方案
    if (!AppState.workDirHandle) return;
    try {
      const fileName = this.getModuleFileName(module);
      await AppState.workDirHandle.removeEntry(fileName);
    } catch (e) {
      console.error(`删除模组文件 ${module.name} 失败`, e);
    }
  },

  /* 生成模组文件名（去除不合法字符） */
  getModuleFileName(module) {
    const safeName = module.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    return `${safeName}.json`;
  },

  /* ========== localStorage 兜底方案 ========== */

  /* 从 localStorage 加载模组列表 */
  loadModulesFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.LS_KEY_MODULES);
      if (data) {
        AppState.modules = JSON.parse(data);
        AppState.modules.forEach(m => {
          if (!m.customDbTypes) m.customDbTypes = {};
        });
        AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      }
    } catch (e) {
      console.error('从 localStorage 加载失败', e);
      AppState.modules = [];
    }
  },

  /* 保存模组列表到 localStorage */
  saveModulesToLocalStorage() {
    try {
      localStorage.setItem(this.LS_KEY_MODULES, JSON.stringify(AppState.modules));
    } catch (e) {
      console.error('保存到 localStorage 失败', e);
    }
  },

  /* 导出全部模组为 JSON 文件 */
  exportAll() {
    const jsonStr = JSON.stringify(AppState.modules, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `御备团-全部模组-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /* 导入模组 JSON 文件 */
  importAll() {
    const input = document.getElementById('importFileInput');
    input.value = '';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (Array.isArray(data)) {
            // 合并导入：按 ID 去重，新数据覆盖旧数据
            const existingIds = new Set(AppState.modules.map(m => m.id));
            for (const mod of data) {
              if (mod.id && mod.name) {
                if (existingIds.has(mod.id)) {
                  // 更新已有模组
                  const idx = AppState.modules.findIndex(m => m.id === mod.id);
                  AppState.modules[idx] = mod;
                } else {
                  AppState.modules.push(mod);
                }
              }
            }
            AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            this.saveModulesToLocalStorage();
            UIRender.renderModuleList();
          } else if (data.id && data.name) {
            // 单个模组文件
            const idx = AppState.modules.findIndex(m => m.id === data.id);
            if (idx >= 0) {
              AppState.modules[idx] = data;
            } else {
              AppState.modules.push(data);
            }
            AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            this.saveModulesToLocalStorage();
            UIRender.renderModuleList();
          }
        } catch (err) {
          console.error('导入 JSON 解析失败', err);
          alert('导入失败：JSON 文件格式不正确');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  /* ========== 统一保存接口（防抖） ========== */

  /* 触发保存（0.5秒防抖） */
  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    UIRender.showSaveStatus('saving');
    this.saveTimer = setTimeout(() => {
      this.saveNow();
    }, 500);
  },

  /* 立即保存 */
  async saveNow() {
    try {
      console.log('[saveNow] useFileSystemAPI:', AppState.useFileSystemAPI, 'workDirPath:', AppState.workDirPath, 'workDirHandle:', AppState.workDirHandle, 'electronAPI:', !!window.electronAPI);
      // iframe 模式下，直接读写 localStorage 做字段级合并，不依赖父窗口 electronAPI
      if (window.self !== window.top && AppState.workDirPath && AppState.currentModule) {
        console.log('[saveNow] iframe 模式，直接合并到 localStorage');
        const saved = localStorage.getItem('gm-assistant-modules');
        if (saved) {
          const modules = JSON.parse(saved);
          const idx = modules.findIndex(m => m.id === AppState.currentModuleId);
          if (idx >= 0) {
            /* 判断当前 iframe 类型：Doc 跳过 board 字段，Board 跳过 document 字段 */
            const isDocIframe = window.location.pathname.includes('doc-editor');
            const isBoardIframe = window.location.pathname.includes('board');
            for (const key of Object.keys(AppState.currentModule)) {
              if (key === 'flowUnits' || key === 'battleDeployments') continue;
              if (isDocIframe && key === 'board') continue;
              if (isBoardIframe && key === 'document') continue;
              modules[idx][key] = AppState.currentModule[key];
            }
            localStorage.setItem('gm-assistant-modules', JSON.stringify(modules));
          }
        }
        UIRender.showSaveStatus('saved');
        localStorage.setItem('gm-assistant-last-save', Date.now().toString());
        return;
      }
      if (AppState.useFileSystemAPI && (AppState.workDirPath || AppState.workDirHandle)) {
        console.log('[saveNow] 走文件系统保存分支, 模组数:', AppState.modules.length);
        for (const mod of AppState.modules) {
          await this.saveModuleToFileSystem(mod);
        }
        /* 同步到 localStorage，确保分屏 iframe 读到最新数据 */
        this.saveModulesToLocalStorage();
      } else {
        console.log('[saveNow] 走 localStorage 保存分支');
        this.saveModulesToLocalStorage();
      }
      UIRender.showSaveStatus('saved');
    } catch (e) {
      console.error('[saveNow] 保存失败', e);
      UIRender.showSaveStatus('error');
    }
  }
};

/* ==========================================================================
 * FlowingMenu 跑马灯菜单动效
 * ========================================================================== */
const FlowingMenu = {
  _items: [],
  _rafIds: [],

  init() {
    this.destroy();
    const allItems = document.querySelectorAll('.fm-item[data-fm-texts]');
    allItems.forEach((item, idx) => {
      const textsAttr = item.getAttribute('data-fm-texts') || '';
      const texts = textsAttr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      if (texts.length === 0) return;
      const iconName = item.getAttribute('data-fm-icon') || '';

      // 清除旧跑马灯
      const oldM = item.querySelector('.fm-marquee');
      if (oldM) oldM.remove();

      // 构建图标 SVG HTML
      const iconHtml = iconName
        ? '<span class="fm-icon"><svg><use href="#' + iconName + '"/></svg></span>'
        : '';

      // 构建一个分段：文字1 + 图标 + 文字2 + 图标 + …
      const buildPart = () => {
        let html = '<div class="fm-marquee-part">';
        texts.forEach(function(t) {
          html += '<span class="fm-marquee-text">' + t + '</span>' + iconHtml;
        });
        html += '</div>';
        return html;
      };

      // 计算需要多少份副本才能填满视口
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;display:flex;';
      tempDiv.innerHTML = buildPart();
      document.body.appendChild(tempDiv);
      const partWidth = tempDiv.firstElementChild.offsetWidth;
      document.body.removeChild(tempDiv);

      const reps = Math.max(4, Math.ceil(window.innerWidth / Math.max(partWidth, 1)) + 2);
      let innerHtml = '';
      for (let i = 0; i < reps; i++) innerHtml += buildPart();

      const marquee = document.createElement('div');
      marquee.className = 'fm-marquee';
      marquee.innerHTML = '<div class="fm-marquee-inner">' + innerHtml + '</div>';
      item.insertBefore(marquee, item.firstChild);

      // 启动无缝滚动
      const inner = marquee.querySelector('.fm-marquee-inner');
      const firstPart = inner.querySelector('.fm-marquee-part');
      const scrollW = firstPart.offsetWidth;
      let pos = 0;
      const speed = 15; // 秒横跨一个分段宽度

      const itemData = { inner, scrollW, pos, speed, lastTime: 0, rafId: null };
      this._items.push(itemData);

      const animate = (timestamp) => {
        if (!itemData.lastTime) itemData.lastTime = timestamp;
        const delta = (timestamp - itemData.lastTime) / 1000;
        itemData.lastTime = timestamp;
        itemData.pos -= (itemData.scrollW / itemData.speed) * delta;
        if (Math.abs(itemData.pos) >= itemData.scrollW) {
          itemData.pos += itemData.scrollW;
        }
        inner.style.transform = 'translateX(' + itemData.pos + 'px)';
        itemData.rafId = requestAnimationFrame(animate);
      };
      itemData.rafId = requestAnimationFrame(animate);
      this._rafIds.push(itemData.rafId);
    });
  },

  destroy() {
    this._rafIds.forEach(id => cancelAnimationFrame(id));
    this._rafIds = [];
    this._items = [];
  }
};

/* ==========================================================================
 * UI 渲染模块
 * 负责所有 DOM 更新和页面渲染
 * ========================================================================== */
const UIRender = {

  /* 渲染模组列表 */
  renderModuleList() {
    const section = document.getElementById('moduleListSection');
    const list = document.getElementById('moduleList');

    if (!section || !list) return;

    // 隐藏加载遮罩（如果有 URL 参数自动打开模组，则由 openModule 完成后隐藏）
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      const hasUrlModule = new URLSearchParams(window.location.search).get('module');
      if (!hasUrlModule) overlay.style.display = 'none';
    }

    if (AppState.modules.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    list.innerHTML = '';

    AppState.modules.forEach((mod, index) => {
      const card = document.createElement('div');
      card.className = 'module-card';
      card.innerHTML = `
        <button class="module-delete" title="删除模组" data-id="${mod.id}">
          <span class="icon"><svg><use href="#i-trash"/></svg></span>
        </button>
        <div class="module-icon">
          <span class="icon icon-xl"><svg><use href="#${AppState.getModuleIcon(index)}"/></svg></span>
        </div>
        <div class="module-name">${this.escapeHtml(mod.name)}</div>
        <div class="module-meta">
          <span class="icon icon-sm icon-muted"><svg><use href="#i-cog"/></svg></span>
          ${this.escapeHtml(mod.system)}
        </div>
        <div class="module-meta">
          <span class="icon icon-sm icon-muted"><svg><use href="#i-save"/></svg></span>
          ${AppState.formatTime(mod.updatedAt)}
        </div>
        <span class="module-status ${AppState.getStatusClass(mod.status)}">${AppState.getStatusLabel(mod.status)}</span>
      `;

      // 点击卡片进入模组
      card.addEventListener('click', (e) => {
        // 如果点击的是删除按钮，不触发进入
        if (e.target.closest('.module-delete')) return;
        App.openModule(mod.id);
      });

      // 删除按钮
      const deleteBtn = card.querySelector('.module-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.showDeleteConfirm(mod);
      });

      list.appendChild(card);
    });
  },

  /* 渲染模组列表页（FlowingMenu 风格） */
  renderModuleListPage() {
    const container = document.getElementById('modulesFlowingMenu');
    if (!container) return;
    FlowingMenu.destroy();
    container.innerHTML = '';

    if (AppState.modules.length === 0) {
      container.innerHTML = '<div class="modules-empty-hint">' +
        '<span class="icon icon-xl" style="color:var(--accent);"><svg><use href="#i-book"/></svg></span>' +
        '<p>还没有模组</p>' +
        '<p><a onclick="App.goHome(); setTimeout(function(){ App.showCreateDialog(); }, 300);">创建一个新故事</a>开始你的冒险</p>' +
      '</div>';
      return;
    }

    AppState.modules.forEach((mod, index) => {
      const item = document.createElement('div');
      item.className = 'fm-item';
      item.setAttribute('data-module-id', mod.id);
      const subtitle = mod.subtitle || mod.name;
      const icon = AppState.moduleIconPool[index % AppState.moduleIconPool.length];
      item.setAttribute('data-fm-texts', mod.name + ',' + subtitle);
      item.setAttribute('data-fm-icon', icon);

      const statusClass = AppState.getStatusClass(mod.status);
      const statusLabel = AppState.getStatusLabel(mod.status);

      const systemInfo = SystemManager.getSystemInfo(mod.system);
      item.innerHTML =
        '<span class="fm-item-link">' + this.escapeHtml(mod.name) + '</span>' +
        '<span class="fm-item-sub">' + this.escapeHtml(systemInfo.name) + ' · ' + statusLabel + '</span>' +
        '<button class="fm-delete-btn" title="删除模组" data-id="' + mod.id + '">' +
          '<span class="icon"><svg><use href="#i-trash"/></svg></span>' +
        '</button>';

      item.addEventListener('click', (e) => {
        if (e.target.closest('.fm-delete-btn')) return;
        App.openModule(mod.id);
      });

      const deleteBtn = item.querySelector('.fm-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.showDeleteConfirm(mod);
      });

      container.appendChild(item);
    });

    FlowingMenu.init();
  },

  /* 切换页面 */
  switchPage(page) {
    AppState.currentPage = page;
    // 隐藏所有页面
    document.querySelectorAll('.page-section').forEach(el => {
      el.classList.remove('active');
    });
    // 显示目标页面
    const targetPage = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
    if (targetPage) targetPage.classList.add('active');

    // 更新世界时钟可见性
    if (typeof WorldClock !== 'undefined') WorldClock._updateVisibility();
    // 更新左侧工具栏位置
    if (typeof BoardManager !== 'undefined') BoardManager._updateToolsPosition();

    // 更新导航栏
    const sep = document.getElementById('navbarSep');
    const moduleEl = document.getElementById('navbarModule');
    const moduleNameEl = document.getElementById('navbarModuleName');
    const saveIndicator = document.getElementById('saveIndicator');

    if (page === 'home' || page === 'modules') {
      sep.style.display = 'none';
      moduleEl.style.display = 'none';
      saveIndicator.style.display = 'none';
      document.getElementById('btnManualSave').style.display = 'none';
    } else {
      sep.style.display = '';
      moduleEl.style.display = '';
      moduleNameEl.textContent = AppState.currentModule ? AppState.currentModule.name : '';
      saveIndicator.style.display = '';
      document.getElementById('btnManualSave').style.display = '';
    }

    // 切换到编辑器页面时初始化编辑器
    if (page === 'editor') {
      DocEditor.init();
      // 如果数据库面板是打开状态，初始化数据库管理器
      const dbPanel = document.getElementById('dbPanel');
      if (dbPanel && dbPanel.classList.contains('open')) {
        DatabaseManager.init();
      }
    }

    // 切换到带团板页面时更新工具栏标题并刷新画布
    if (page === 'board') {
      const titleEl = document.getElementById('boardToolbarTitle');
      if (titleEl && AppState.currentModule) {
        titleEl.textContent = AppState.currentModule.name + ' - 带团板';
      }
      BoardManager.renderUnitNotes(BoardManager.currentUnitIndex);
    }
  },

  /* 显示保存状态 */
  showSaveStatus(status) {
    const indicator = document.getElementById('saveIndicator');
    const text = document.getElementById('saveText');
    indicator.className = 'save-indicator';
    switch (status) {
      case 'saving':
        indicator.classList.add('saving');
        text.textContent = '保存中...';
        break;
      case 'saved':
        indicator.classList.add('saved');
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        text.textContent = `已保存 ${timeStr}`;
        break;
      case 'error':
        text.textContent = '保存失败';
        break;
    }
  },

  /* HTML 转义 */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

/* ==========================================================================
 * 快捷键管理模块
 * 管理自定义快捷键绑定，保存至工具配置（cfpt-config.json）
 * ========================================================================== */
const ShortcutManager = {

  /* 默认快捷键定义 */
  _defaults: {
    togglePanel:       'Ctrl+`',
    manualSave:        'Ctrl+S',
    undo:              'Ctrl+Z',
    redo:              'Ctrl+Y'
  },

  /* 当前绑定（运行时） */
  _bindings: {},

  /* 当前正在录制的 actionKey */
  _recordingAction: null,

  /* 不可修改的快捷键（仅供展示提醒） */
  _readonly: new Set(['undo', 'redo']),

  /* 默认快捷键的描述标签 */
  _labels: {
    togglePanel:    '切换面板（文档编辑器/带团板）',
    manualSave:     '手动保存',
    undo:           '撤销',
    redo:           '重做'
  },

  /* 初始化 */
  async init() {
    // 从工具配置加载
    const cfg = await this._loadConfig();
    this._bindings = { ...this._defaults, ...cfg.shortcuts };
    this._registerGlobalListener();

    // 弹窗遮罩点击关闭
    const overlay = document.getElementById('shortcutOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.hideDialog();
      });
    }
  },

  /* 从 cfpt-config.json 加载配置 */
  async _loadConfig() {
    try {
      if (window.electronAPI && window.electronAPI.getConfig) {
        return await window.electronAPI.getConfig();
      }
    } catch (e) { console.warn('[ShortcutManager] 读取配置失败，使用默认值', e); }
    return {};
  },

  /* 保存配置到 cfpt-config.json */
  async _saveConfig() {
    try {
      if (window.electronAPI && window.electronAPI.saveConfig) {
        await window.electronAPI.saveConfig({ shortcuts: this._bindings });
      }
    } catch (e) { console.warn('[ShortcutManager] 保存配置失败', e); }
  },

  /* 注册全局键盘监听 */
  _registerGlobalListener() {
    document.addEventListener('keydown', (e) => {
      // 如果正在录制快捷键，优先处理录制
      if (this._recordingAction) {
        e.preventDefault();
        e.stopPropagation();
        this._handleRecording(e);
        return;
      }

      // 构建按键标识
      const combo = this._buildCombo(e);
      if (!combo) return;

      // 匹配动作（跳过只读项，它们由浏览器原生处理）
      let matchedAction = null;
      for (const [action, binding] of Object.entries(this._bindings)) {
        if (this._readonly.has(action)) continue;
        if (combo === binding) { matchedAction = action; break; }
      }
      if (!matchedAction) return;

      // 在输入框 / contenteditable 中：仅 manualSave / undo / redo 放行
      const tag = e.target.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      if (isInput && matchedAction !== 'manualSave') return;

      e.preventDefault();
      e.stopPropagation();
      this._execute(matchedAction);
    }, true);
  },

  /* 构建修饰键+按键字符串 */
  _buildCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Meta');

    // 过滤纯修饰键
    const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta'];
    if (modifierKeys.includes(e.key)) return null;

    // 统一键名
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();
    if (key === '`') key = '`';

    parts.push(key);
    return parts.join('+');
  },

  /* 执行快捷键动作 */
  _execute(action) {
    switch (action) {
      case 'togglePanel':
        this._togglePanelFocus();
        break;
      case 'manualSave':
        if (typeof App !== 'undefined' && App.manualSave) {
          App.manualSave();
        }
        break;
    }
  },

  /* 切换分屏面板焦点 */
  _togglePanelFocus() {
    if (typeof SharedBridge !== 'undefined' && SharedBridge.isInIframe()) {
      // 在 iframe 中，通知父窗口切换焦点
      SharedBridge.send('SHORTCUT_TOGGLE_FOCUS', {});
    }
    // 在非 iframe 的单页模式下，编辑器 ↔ 带团板切换
    if (AppState.currentPage === 'editor') {
      App.switchToBoard();
    } else if (AppState.currentPage === 'board') {
      App.switchToEditor();
    }
  },

  /* ========== 设置弹窗 ========== */

  showDialog() {
    this._recordingAction = null;
    this._renderDialog();
    document.getElementById('shortcutOverlay').classList.add('active');
  },

  hideDialog() {
    this._recordingAction = null;
    document.getElementById('shortcutOverlay').classList.remove('active');
  },

  /* 渲染弹窗内容 */
  _renderDialog() {
    const body = document.getElementById('shortcutDialogBody');
    let html = '<div class="shortcut-section-title">面板切换</div>';
    html += this._renderItem('togglePanel');

    html += '<div class="shortcut-section-title">通用</div>';
    const generalActions = ['manualSave', 'undo', 'redo'];
    for (const a of generalActions) {
      html += this._renderItem(a);
    }

    body.innerHTML = html;

    // 绑定点击事件
    body.querySelectorAll('.shortcut-key-display').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = el.dataset.action;
        this._startRecording(action);
      });
    });

    body.querySelectorAll('.shortcut-clear-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = el.dataset.action;
        delete this._bindings[action];
        this._renderDialog();
        this._saveConfig();
      });
    });
  },

  /* 渲染单个快捷键项 */
  _renderItem(action) {
    const binding = this._bindings[action] || '';
    const label = this._labels[action] || action;
    const isReadonly = this._readonly.has(action);

    // 只读项：仅作固定展示，不可编辑
    if (isReadonly) {
      return `
        <div class="shortcut-item">
          <span class="shortcut-item-label">${label}</span>
          <div class="shortcut-key-recorder">
            <span class="shortcut-key-display readonly" title="系统固定快捷键，不可修改">${this._formatDisplay(binding)}</span>
          </div>
        </div>`;
    }

    const isRecording = this._recordingAction === action;
    const isEmpty = !binding;
    const hasConflict = !isEmpty && this._findConflict(action, binding);

    let cls = 'shortcut-key-display';
    if (isRecording) cls += ' recording';
    if (hasConflict) cls += ' conflict';

    const displayText = isRecording ? '按下组合键'
                      : isEmpty ? '未设置'
                      : this._formatDisplay(binding);

    const clearBtn = !isEmpty
      ? `<button class="shortcut-clear-btn" data-action="${action}" title="清除快捷键">&times;</button>`
      : '';

    return `
      <div class="shortcut-item">
        <span class="shortcut-item-label">${label}</span>
        <div class="shortcut-key-recorder">
          <span class="${cls}" data-action="${action}">${displayText}</span>
          ${clearBtn}
        </div>
      </div>`;
  },

  /* 格式化按键显示 */
  _formatDisplay(binding) {
    return binding.replace(/\+/g, ' + ');
  },

  /* 检查是否有其他动作绑定了相同按键 */
  _findConflict(action, binding) {
    for (const [a, b] of Object.entries(this._bindings)) {
      if (a !== action && b === binding) return a;
    }
    return null;
  },

  /* 开始录制 */
  _startRecording(action) {
    this._recordingAction = action;
    this._renderDialog();
  },

  /* 处理录制按键 */
  _handleRecording(e) {
    const combo = this._buildCombo(e);
    const action = this._recordingAction;

    // ESC 取消录制
    if (e.key === 'Escape') {
      this._recordingAction = null;
      this._renderDialog();
      return;
    }

    if (combo) {
      this._bindings[action] = combo;
      this._recordingAction = null;
      this._renderDialog();
      this._saveConfig();
    }
  },

  /* 恢复默认 */
  resetDefaults() {
    this._bindings = { ...this._defaults };
    this._recordingAction = null;
    this._renderDialog();
    this._saveConfig();
  }
};

/* ==========================================================================
 * 事件处理模块
 * 处理所有用户交互事件
 * ========================================================================== */
const App = {

  /* 初始化应用 */
  async init() {
    await StorageManager.init();
    await RulebookManager.init();
    await ShortcutManager.init();

    // 监听创建模组对话框的名称输入
    const nameInput = document.getElementById('createName');
    nameInput.addEventListener('input', () => {
      const btn = document.getElementById('createConfirmBtn');
      btn.disabled = !nameInput.value.trim();
    });

    // 监听回车键确认创建
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && nameInput.value.trim()) {
        this.confirmCreate();
      }
    });

    // 监听文档文件选择
    const docInput = document.getElementById('pdfFileInput');
    docInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        AppState.pendingDocFile = file.name;
        AppState.pendingDocType = file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';
        document.getElementById('createPdfName').value = file.name;
        
        if (typeof Tutorial !== 'undefined') {
          Tutorial.emit('docFileSelected', { fileName: file.name, type: AppState.pendingDocType });
        }
      }
    });

    // 监听模态框点击遮罩关闭
    document.getElementById('createModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideCreateDialog();
      }
    });

    // 监听确认对话框点击遮罩关闭
    document.getElementById('confirmOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        this.hideConfirm();
      }
    });

    // 监听角色编辑退出确认对话框点击遮罩关闭
    const charLeaveOverlay = document.getElementById('charLeaveConfirm');
    if (charLeaveOverlay) {
      charLeaveOverlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          CharAlbum._leaveCancel();
        }
      });
    }

    // 监听 ESC 键关闭对话框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideCreateDialog();
        this.hideConfirm();
        if (charLeaveOverlay) charLeaveOverlay.classList.remove('active');
      }
    });

    // 初始化首页 FlowingMenu 动效
    FlowingMenu.init();

    // 跨 iframe 通信：监听模块切换事件
    try {
      if (typeof SharedBridge !== 'undefined' && SharedBridge.isInIframe()) {
        SharedBridge.on('MODULE_CHANGED', (data) => {
          if (data.moduleId && AppState.currentModule?.id !== data.moduleId) {
            const target = AppState.modules.find(m => m.id === data.moduleId);
            if (target) {
              AppState.currentModule = target;
              if (AppState._isDocIframe && typeof DocEditor !== 'undefined') {
                DocEditor.loadModule(target);
              }
              if (AppState._isBoardIframe && typeof BoardManager !== 'undefined') {
                BoardManager.loadBoard(target);
              }
            }
          }
        });

        // 分屏模式：监听跳转原文请求
        SharedBridge.on('JUMP_TO_SOURCE', (data) => {
          if (data.entryId) {
            const marker = DocEditor.editorEl.querySelector(`.source-marker[data-source-entry-id="${data.entryId}"]`);
            if (marker) {
              marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
              marker.classList.remove('source-flash');
              void marker.offsetWidth;
              marker.classList.add('source-flash');
              setTimeout(() => marker.classList.remove('source-flash'), 2000);
            } else if (data.snippet) {
              const walker = document.createTreeWalker(DocEditor.editorEl, NodeFilter.SHOW_TEXT, null, false);
              let node;
              while (node = walker.nextNode()) {
                const idx = node.textContent.indexOf(data.snippet.substring(0, 30));
                if (idx !== -1) {
                  const range = document.createRange();
                  range.setStart(node, idx);
                  range.setEnd(node, idx + 30);
                  const rect = range.getBoundingClientRect();
                  DocEditor.editorEl.scrollTop += rect.top - DocEditor.editorEl.clientHeight / 2;
                  break;
                }
              }
            }
          }
        });

        // 分屏模式：文档编辑器入库后自动在画布创建便签
        SharedBridge.on('ENTRY_ADDED', (data) => {
          if (data.dbKey && data.entryId && typeof BoardManager !== 'undefined') {
            BoardManager.placeFromDatabase(data.dbKey, data.entryId, data.entry);
          }
        });
      }
    } catch(e) { /* ignore if SharedBridge unavailable */ }
  },

  /* 返回首页 */
  goHome() {
    // 如果角色图鉴页正在编辑，弹出保存确认
    if (AppState.currentPage === 'characters' && typeof CharAlbum !== 'undefined' && CharAlbum._isEditing) {
      CharAlbum._attemptLeavePage('home', true);
      return;
    }
    // 如果编辑器有未保存内容，先保存
    if (AppState.currentPage === 'editor' && DocEditor.isDirty) {
      DocEditor.saveDocument();
    }
    // 关闭带团板数据库面板
    if (BoardManager._dbPanelOpen) {
      BoardManager.toggleDbPanel();
    }
    // 退出连线/擦除模式
    BoardManager._exitConnectMode();
    BoardManager._exitEraseMode();
    AppState.currentModuleId = null;
    AppState.currentModule = null;
    UIRender.switchPage('home');
    FlowingMenu.init();
  },

  /* 显示创建模组对话框 */
  showCreateDialog() {
    if (!StorageManager.ensureWorkDir()) return;
    const modal = document.getElementById('createModal');
    const nameInput = document.getElementById('createName');
    const systemSelect = document.getElementById('createSystem');
    const pdfName = document.getElementById('createPdfName');
    const confirmBtn = document.getElementById('createConfirmBtn');

    // 重置表单
    nameInput.value = '';
    systemSelect.value = 'dnd5r';
    pdfName.value = '';
    confirmBtn.disabled = true;
    AppState.pendingDocFile = null;
    AppState.pendingDocType = null;

    modal.classList.add('active');
    // 自动聚焦到名称输入框
    setTimeout(() => nameInput.focus(), 200);

    // 非教学模式下弹出 PDF 温馨提醒
    if (!TutorialManager._isActive) {
      setTimeout(() => {
        document.getElementById('pdfReminderOverlay').classList.add('active');
      }, 300);
    }
  },

  /* 隐藏创建模组对话框 */
  hideCreateDialog() {
    document.getElementById('createModal').classList.remove('active');
    document.getElementById('pdfReminderOverlay').classList.remove('active');
  },

  /* 关闭 PDF 温馨提醒弹窗 */
  hidePdfReminder() {
    document.getElementById('pdfReminderOverlay').classList.remove('active');
  },

  /* 选择 PDF 文件 */
  pickPdf() {
    document.getElementById('pdfFileInput').click();
  },

  /* 确认创建模组 */
  confirmCreate() {
    const name = document.getElementById('createName').value.trim();
    const system = document.getElementById('createSystem').value;

    if (!name) return;

    // 创建模组数据
    const module = AppState.createEmptyModule(name, system);
    if (AppState.pendingDocFile) {
      module.pdfFileName = AppState.pendingDocFile;
    }

    // 添加到模组列表
    AppState.modules.push(module);
    AppState.modules.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    // 保存
    StorageManager.scheduleSave();

    // 关闭对话框
    this.hideCreateDialog();

    // 进入编辑器页面
    this.openModule(module.id);

    // 如果有待导入的文档文件，异步处理
    if (AppState.pendingDocFile) {
      const docInput = document.getElementById('pdfFileInput');
      const docFile = docInput.files[0];
      if (docFile) {
        if (AppState.pendingDocType === 'docx') {
          DocEditor.showToast('正在导入 Word 文档，请稍候...', 'info');
          WordProcessor.processWord(docFile, module.id);
        } else {
          DocEditor.showToast('正在导入 PDF，请稍候...', 'info');
          PDFProcessor.processPDF(docFile, module.id);
        }
      }
      AppState.pendingDocFile = null;
      AppState.pendingDocType = null;
    }

    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('storyCreated', { isTutorial: name.includes('教学') });
      if (name.includes('教学')) {
        TutorialManager._markLatestModuleAsTutorial();
      }
    }
  },

  /* 处理"备团/带团"按钮 */
  handleRunSession() {
    if (!StorageManager.ensureWorkDir()) return;
    UIRender.switchPage('modules');
    UIRender.renderModuleListPage();
  },

  /* 迁移旧格式数据库数据到新的库分组结构 */
  _migrateOldDatabases(mod) {
    if (!mod || !mod.databases) return;

    // 兼容旧模组：初始化 hiddenDbTypes
    if (!Array.isArray(mod.hiddenDbTypes)) {
      mod.hiddenDbTypes = [];
    }

    const dbConfig = SystemManager.getDbConfig(mod.system || 'dnd5r');
    const configKeys = Object.keys(dbConfig);
    const hasOldFormat = configKeys.some(k => Array.isArray(mod.databases[k]));
    
    if (hasOldFormat) {
      const migrated = {};
      migrated['1号库'] = {};
      for (const key of configKeys) {
        migrated['1号库'][key] = mod.databases[key] || [];
      }
      mod.databases = migrated;
    }
    
    if (!mod.databases['1号库']) {
      mod.databases['1号库'] = {};
      for (const key of configKeys) {
        mod.databases['1号库'][key] = [];
      }
    }
  },

  /* 归一化规则书系统值（兼容旧版本） */
  _normalizeSystem(mod) {
    if (!mod.system) {
      mod.system = 'dnd5r';
      return;
    }
    if (mod.system === 'COC 7th') {
      mod.system = 'coc7';
      return;
    }
    const oldValues = ['D&D5E', 'D&D5R', 'D&D 5E'];
    if (oldValues.includes(mod.system)) {
      mod.system = 'dnd5r';
    }
  },

  /* 打开模组 */
  openModule(moduleId) {
    const mod = AppState.findModule(moduleId);
    if (!mod) return;

    this._migrateOldDatabases(mod);

    this._normalizeSystem(mod);

    AppState.currentModuleId = moduleId;
    AppState.currentModule = mod;

    try {
      if (typeof SharedBridge !== 'undefined' && SharedBridge.isInIframe()) {
        SharedBridge.send('MODULE_CHANGED', { moduleId: AppState.currentModule.id });
      }
    } catch(e) { /* ignore if SharedBridge unavailable */ }

    // 根据状态决定进入哪个页面
    // 草稿 → 编辑器，进行中/已完成 → 带团板
    // 阶段二默认进入编辑器
    const targetPage = AppState._isBoardIframe ? 'board' : 'editor';
    UIRender.switchPage(targetPage);

    // 加载文档到编辑器
    DocEditor.loadDocument(mod);

    // 初始化带团板（板 iframe 需独立渲染，init 内部会调用 loadBoard）
    if (targetPage === 'board') {
      BoardManager.init();
    }

    // 重置数据库面板状态（切换模组时清空旧模组的数据库缓存）
    DatabaseManager._currentDbKey = null;
    DatabaseManager._currentDbGroup = null;
    DatabaseManager.renderDbGroupSelector();
    DatabaseManager.renderDbList();
    BoardManager._currentDbKey = null;
    BoardManager._currentDbGroup = null;
    BoardManager.renderDbGroupSelector();
    BoardManager.renderDbList();
    const dbPanel = document.getElementById('dbPanel');
    if (dbPanel && dbPanel.classList.contains('open')) {
      // 面板打开中，重新选择当前模组的第一个有数据的分类
      if (mod && mod.databases) {
        const groups = Object.keys(mod.databases);
        const group = groups[0] || '1号库';
        DatabaseManager.selectDbGroup(group);
      }
    }
  },

  /* 切换到带团板 */
  /* 进入分屏模式 */
  enterSplitScreen() {
    // 确保当前编辑已保存
    if (AppState.currentModule && typeof DocEditor !== 'undefined' && DocEditor.isDirty) {
      DocEditor.saveDocument();
    }
    // 将完整模组数据同步到 localStorage，供分屏 iframe 初始化时读取
    StorageManager.saveModulesToLocalStorage();
    // 写入当前模块 ID 到 localStorage，供分屏壳读取
    if (AppState.currentModule) {
      localStorage.setItem('gm-assistant-current-module-id', AppState.currentModule.id);
    }
    // 写入工作目录路径到 localStorage，供分屏 iframe 初始化及写盘使用
    if (AppState.workDirPath) {
      localStorage.setItem('gm-assistant-workdir', AppState.workDirPath);
    }
    // 跳转到分屏页面
    window.location.href = 'split-screen.html';
  },

  switchToBoard() {
    UIRender.switchPage('board');
    BoardManager.init();
    // 刷新带团板数据库面板状态
    if (BoardManager._dbPanelOpen) {
      BoardManager.renderDbGroupSelector();
      BoardManager.renderDbList();
      if (BoardManager._currentDbKey) {
        BoardManager.renderDbEntries(BoardManager._currentDbKey);
      }
    }
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('boardEntered', {});
    }
  },

  /* 切换到编辑器（从带团板返回） */
  switchToEditor() {
    // 退出连线/擦除模式
    BoardManager._exitConnectMode();
    BoardManager._exitEraseMode();
    // 关闭带团板数据库面板
    if (BoardManager._dbPanelOpen) {
      BoardManager.toggleDbPanel();
    }
    UIRender.switchPage('editor');
    DocEditor.loadDocument(AppState.currentModule);
    // 刷新文档编辑器数据库面板状态
    DatabaseManager.renderDbGroupSelector();
    DatabaseManager.renderDbList();
    const dbPanel = document.getElementById('dbPanel');
    if (dbPanel && dbPanel.classList.contains('open')) {
      if (DatabaseManager._currentDbKey) {
        DatabaseManager.renderEntries(DatabaseManager._currentDbKey);
      }
    }
  },

  /* 显示删除确认 */
  showDeleteConfirm(mod) {
    this.showConfirm(
      '确认删除',
      `确定要删除模组「${mod.name}」吗？此操作不可撤销。`,
      '删除',
      async () => {
        const modulesContainer = document.getElementById('modulesFlowingMenu');
        const itemEl = modulesContainer ? modulesContainer.querySelector('[data-module-id="' + mod.id + '"]') : null;

        const doDelete = async () => {
          AppState.modules = AppState.modules.filter(m => m.id !== mod.id);

          if (AppState.currentModuleId === mod.id) {
            this.goHome();
          }

          if (window.electronAPI && AppState.workDirPath) {
            const fileName = StorageManager.getModuleFileName(mod);
            await window.electronAPI.deleteFile(AppState.workDirPath + '/' + fileName);
          } else if (AppState.useFileSystemAPI && AppState.workDirHandle) {
            await StorageManager.deleteModuleFromFileSystem(mod);
          } else {
            StorageManager.saveModulesToLocalStorage();
          }

          UIRender.renderModuleList();
          UIRender.renderModuleListPage();
        };

        if (itemEl) {
          itemEl.classList.add('fm-item-removing');
          itemEl.addEventListener('animationend', () => doDelete(), { once: true });
        } else {
          await doDelete();
        }
      }
    );
  },

  /* 显示通用确认对话框 */
  showConfirm(title, message, okText, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOkBtn').textContent = okText;
    AppState.confirmCallback = callback;
    document.getElementById('confirmOverlay').classList.add('active');
  },

  /* 隐藏确认对话框 */
  hideConfirm() {
    document.getElementById('confirmOverlay').classList.remove('active');
    AppState.confirmCallback = null;
  },

  /* 确认对话框确认 */
  confirmOk() {
    if (typeof AppState.confirmCallback === 'function') {
      AppState.confirmCallback();
    }
    this.hideConfirm();
  },

  /* 手动保存 */
  manualSave() {
    if (AppState.currentPage === 'editor') {
      DocEditor.saveDocument();
    }
    StorageManager.saveNow();
  }
};

/* ==========================================================================
 * PDF 处理模块（增强版 v2）
 * 核心原则：文本顺序以 getTextContent() 为准，颜色信息作为附加增强层。
 * ========================================================================== */
const PDFProcessor = {

  _headingCounter: 0,

  /* ==================== 主入口 ==================== */

  /* 处理导入的 PDF 文件 */
  async processPDF(file, moduleId) {
    const mod = AppState.findModule(moduleId);
    if (!mod) return;

    try {
      this._headingCounter = 0;
      this.updateProgress(0, 1, '读取 PDF 文件...');
      const arrayBuffer = await file.arrayBuffer();

      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdf.worker.min.js';
      }

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;

      /* 提取 PDF 书签（大纲） */
      let outline = null;
      try {
        outline = await pdf.getOutline();
      } catch (e) {
        console.warn('PDF 书签提取失败', e);
      }

      /* 如果有书签，将其转换为目录结构 */
      let bookmarkHeadings = [];
      if (outline && outline.length > 0) {
        bookmarkHeadings = this.flattenOutline(outline);
      }

      /* 第一遍：提取所有页的文本项（以 getTextContent 为准） */
      const allPageItems = []; // 所有页的文本项

      for (let i = 1; i <= totalPages; i++) {
        this.updateProgress(i, totalPages, `提取文本和格式...`);
        const page = await pdf.getPage(i);

        /* 提取文本项（保证顺序正确） */
        const textContent = await page.getTextContent();
        const items = this.enrichItems(textContent.items);

        /* 删除页码 */
        this.removePageNumbers(items);

        /* 操作符列表提取颜色（主要方法） */
        let opColorMap = [];
        try {
          const opList = await page.getOperatorList();
          opColorMap = this.buildColorMapFromOps(opList);
        } catch (e) {
          console.warn(`第 ${i} 页操作符列表提取失败`, e);
        }

        /* Canvas 采样（辅助方法） */
        let canvasColorMap = [];
        try {
          const canvas = document.createElement('canvas');
          const scale = 4.0;
          const viewport = page.getViewport({ scale: scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport: viewport }).promise;
          canvasColorMap = this.sampleColorsFromCanvas(ctx, viewport, items);
        } catch (e) {
          console.warn(`第 ${i} 页 Canvas 采样失败`, e);
        }

        /* 双源颜色匹配（操作符列表优先，Canvas 补充） */
        this.matchColorsToItemsDual(items, opColorMap, canvasColorMap);

        allPageItems.push(items);
      }

      /* 统计正文字号 */
      this.updateProgress(totalPages, totalPages, '分析文档结构...');
      const allItems = allPageItems.flat();
      const bodyFontSize = this.detectBodyFontSize(allItems);

      /* 生成 HTML（保留格式，按页分隔） */
      const htmlParts = [];
      for (let i = 0; i < allPageItems.length; i++) {
        htmlParts.push(this.itemsToHtml(allPageItems[i], bodyFontSize, i + 1));
      }
      const htmlContent = htmlParts.join('<div class="pdf-page-break"></div>');

      /* 提取纯文本（用于关键词搜索） */
      const rawText = allItems.map(item => item.str).join('');

      /* 标题识别 */
      const headings = this.processHeadingsEnhanced(allItems, bodyFontSize, rawText);

      /* 角色数据块识别 */
      const characters = this.processCharacterBlocks(rawText);

      /* 表格识别 */
      const tables = this.processTables(rawText);

      /* 存入模组数据 */
      mod.document = {
        pages: allPageItems.map((items, idx) => ({
          pageNum: idx + 1,
          text: items.map(item => item.str).join(''),
          html: ''
        })),
        rawText: rawText,
        htmlContent: htmlContent,
        processedHeadings: headings,
        processedCharacters: characters,
        processedTables: tables,
        bodyFontSize: bodyFontSize,
        bookmarks: bookmarkHeadings
      };

      /* 触发保存和渲染 */
      StorageManager.scheduleSave();
      DocEditor.loadDocument(mod);
      DocEditor.renderTocTree();

      /* 渐显动画 */
      const wrapper = document.querySelector('.editor-content-wrap');
      if (wrapper) {
        wrapper.classList.remove('visible');
        /* 强制重排以触发过渡 */
        void wrapper.offsetWidth;
        wrapper.classList.add('visible');
      }

      /* 隐藏进度条，显示结果 */
      this.hideProgress();
      let msg = `PDF 导入完成，共 ${totalPages} 页`;
      if (headings.length > 0) msg += `，识别到 ${headings.length} 个标题`;
      if (characters.length > 0) msg += `，${characters.length} 个角色`;
      if (tables.length > 0) msg += `，${tables.length} 个表格`;
      DocEditor.showToast(msg, 'success');

    } catch (e) {
      console.error('PDF 处理失败', e);
      this.hideProgress();
      DocEditor.showToast('PDF 处理失败：' + e.message, 'error');
    }
  },

  /* ==================== 进度条 ==================== */

  /* 将 PDF 书签（大纲）展平为目录结构 */
  flattenOutline(outline, level) {
    level = level || 1;
    const result = [];
    for (const item of outline) {
      result.push({
        title: item.title,
        level: Math.min(level, 3), /* 限制最大层级为 3 */
        dest: item.dest
      });
      if (item.items && item.items.length > 0) {
        result.push.apply(result, this.flattenOutline(item.items, level + 1));
      }
    }
    return result;
  },

  /* 查找匹配书签标题的文本行 */
  findBookmarkMatch(text) {
    const mod = AppState.currentModule;
    if (!mod || !mod.document || !mod.document.bookmarks) return null;

    const cleanText = text.replace(/\s+/g, '').trim();
    for (const bookmark of mod.document.bookmarks) {
      const cleanTitle = bookmark.title.replace(/\s+/g, '').trim();
      if (cleanText === cleanTitle || cleanText.startsWith(cleanTitle)) {
        return bookmark;
      }
    }
    return null;
  },

  /* 更新进度条显示 */
  updateProgress(current, total, detail) {
    const bar = document.getElementById('pdfProgressBar');
    const fill = document.getElementById('pdfProgressFill');
    const text = document.getElementById('pdfProgressText');
    const detailEl = document.getElementById('pdfProgressDetail');

    if (!bar) return;
    bar.style.display = '';
    const pct = Math.round((current / total) * 100);
    fill.style.width = pct + '%';
    text.textContent = `正在处理第 ${current}/${total} 页...`;
    if (detailEl) detailEl.textContent = detail || '';
  },

  /* 隐藏进度条 */
  hideProgress() {
    const bar = document.getElementById('pdfProgressBar');
    if (bar) bar.style.display = 'none';
  },

  /* ==================== 文本项格式增强 ==================== */

  /* 为每个文本项附加格式信息（从 getTextContent 的 transform 和 fontName 提取）
   * _fontSize: 从 transform 矩阵计算（sqrt(tx^2 + ty^2)）
   * _fontName: 直接取 fontName
   * _isBold: /bold/i.test(fontName)
   * _isItalic: /italic|oblique/i.test(fontName)
   * _color: 初始为 null，后续由 matchColorsToItems 填充 */
  enrichItems(items) {
    for (const item of items) {
      if (!item.str && item.str !== ' ') continue;
      /* 从 transform 矩阵计算字号 */
      if (item.transform) {
        item._fontSize = Math.sqrt(
          item.transform[0] * item.transform[0] +
          item.transform[1] * item.transform[1]
        );
      }
      item._fontName = item.fontName || '';
      item._isBold = false; /* 不再自动检测加粗，避免误判 */
      item._isItalic = false; /* 同样不自动检测斜体 */
      item._color = null; /* 初始为 null，颜色作为附加层 */
    }
    return items;
  },

  /* ==================== 颜色提取（操作符列表 + Canvas 双源） ==================== */

  /* 从 PDF 操作符列表提取颜色（主要方法，100% 准确的颜色值）
   * 遍历操作符列表，追踪当前填充色/描边色/CTM/TextMatrix
   * 在文本渲染操作符（showText 等）时记录位置和颜色 */
  buildColorMapFromOps(opList) {
    const OPS = pdfjsLib.OPS;
    const ops = opList.ops;
    const argsArray = opList.argsArray;

    /* 当前颜色状态 */
    let fillColor = [0, 0, 0]; // 填充色（默认黑色）
    let strokeColor = [0, 0, 0]; // 描边色（默认黑色）

    /* 当前变换矩阵 */
    let ctm = [1, 0, 0, 1, 0, 0];
    let textMatrix = [1, 0, 0, 1, 0, 0];

    /* 图形状态栈 */
    const stateStack = [];

    /* 当前文本使用的颜色 */
    let activeTextColor = [0, 0, 0];

    const colorMap = [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const args = argsArray[i];

      switch (op) {
        case OPS.save:
          stateStack.push({
            fillColor: [...fillColor],
            strokeColor: [...strokeColor],
            ctm: [...ctm],
            textMatrix: [...textMatrix],
            activeTextColor: [...activeTextColor]
          });
          break;

        case OPS.restore:
          if (stateStack.length > 0) {
            const state = stateStack.pop();
            fillColor = state.fillColor;
            strokeColor = state.strokeColor;
            ctm = state.ctm;
            textMatrix = state.textMatrix;
            activeTextColor = state.activeTextColor;
          }
          break;

        /* === 颜色设置 === */
        case OPS.setFillRGBColor:
          fillColor = [args[0], args[1], args[2]];
          break;
        case OPS.setStrokeRGBColor:
          strokeColor = [args[0], args[1], args[2]];
          break;
        case OPS.setFillGray:
          fillColor = [args[0], args[0], args[0]];
          break;
        case OPS.setStrokeGray:
          strokeColor = [args[0], args[0], args[0]];
          break;
        case OPS.setFillColorN:
          if (args.length >= 3) {
            fillColor = [args[0], args[1], args[2]];
          } else if (args.length === 1) {
            fillColor = [args[0], args[0], args[0]];
          }
          break;
        case OPS.setStrokeColorN:
          if (args.length >= 3) {
            strokeColor = [args[0], args[1], args[2]];
          } else if (args.length === 1) {
            strokeColor = [args[0], args[0], args[0]];
          }
          break;
        case OPS.setFillColor:
          /* 可能是 Pattern，跳过 */
          break;
        case OPS.setStrokeColor:
          break;
        case OPS.setFillCMYKColor:
          if (args.length >= 4) {
            const c = args[0], m = args[1], y = args[2], k = args[3];
            fillColor = [
              1 - Math.min(1, c * (1 - k) + k),
              1 - Math.min(1, m * (1 - k) + k),
              1 - Math.min(1, y * (1 - k) + k)
            ];
          }
          break;
        case OPS.setStrokeCMYKColor:
          if (args.length >= 4) {
            const c = args[0], m = args[1], y = args[2], k = args[3];
            strokeColor = [
              1 - Math.min(1, c * (1 - k) + k),
              1 - Math.min(1, m * (1 - k) + k),
              1 - Math.min(1, y * (1 - k) + k)
            ];
          }
          break;

        /* === 矩阵变换 === */
        case OPS.setTextMatrix:
          /* args = [a, b, c, d, e, f] */
          textMatrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
          break;

        case OPS.transform:
          /* 新 CTM = 参数矩阵 x 旧 CTM
           * 参数矩阵 [a, b, c, d, e, f] 表示：
           * | a c e |
           * | b d f |
           * | 0 0 1 | */
          if (args.length >= 6) {
            const a = args[0], b = args[1], c = args[2], d = args[3], e = args[4], f = args[5];
            ctm = [
              a * ctm[0] + c * ctm[1],
              a * ctm[1] + c * ctm[3],
              b * ctm[0] + d * ctm[2],
              b * ctm[1] + d * ctm[3],
              e * ctm[0] + f * ctm[2] + ctm[4],
              e * ctm[1] + f * ctm[3] + ctm[5]
            ];
          }
          break;

        case OPS.setFont:
          /* args = [fontName, size]，不影响颜色 */
          break;

        /* === 文本渲染操作符 === */
        case OPS.showText: {
          activeTextColor = [...fillColor];
          /* 文本位置 = CTM x TextMatrix */
          const tx = ctm[0] * textMatrix[4] + ctm[2] * textMatrix[5] + ctm[4];
          const ty = ctm[1] * textMatrix[4] + ctm[3] * textMatrix[5] + ctm[5];
          colorMap.push({ x: tx, y: ty, color: [...activeTextColor] });
          break;
        }

        case OPS.showSpacedText: {
          activeTextColor = [...fillColor];
          const tx = ctm[0] * textMatrix[4] + ctm[2] * textMatrix[5] + ctm[4];
          const ty = ctm[1] * textMatrix[4] + ctm[3] * textMatrix[5] + ctm[5];
          colorMap.push({ x: tx, y: ty, color: [...activeTextColor] });
          break;
        }

        case OPS.nextLineShowText: {
          activeTextColor = [...fillColor];
          /* nextLineShowText 参数：[offset, ...textArgs] */
          if (args.length >= 1) {
            textMatrix[5] -= args[0];
          }
          const tx = ctm[0] * textMatrix[4] + ctm[2] * textMatrix[5] + ctm[4];
          const ty = ctm[1] * textMatrix[4] + ctm[3] * textMatrix[5] + ctm[5];
          colorMap.push({ x: tx, y: ty, color: [...activeTextColor] });
          break;
        }

        case OPS.nextLineSetSpacingShowText: {
          activeTextColor = [...fillColor];
          /* 参数：[charSpacing, wordSpacing, offset, ...textArgs] */
          if (args.length >= 3) {
            textMatrix[5] -= args[2];
          }
          const tx = ctm[0] * textMatrix[4] + ctm[2] * textMatrix[5] + ctm[4];
          const ty = ctm[1] * textMatrix[4] + ctm[3] * textMatrix[5] + ctm[5];
          colorMap.push({ x: tx, y: ty, color: [...activeTextColor] });
          break;
        }

        case OPS.nextLine: {
          /* 移动到下一行 */
          if (args.length >= 1) {
            textMatrix[5] -= args[0];
          }
          break;
        }
      }
    }

    return colorMap;
  },

  /* ==================== 颜色提取（Canvas 取色 - 辅助方法） ==================== */

  /* 从 Canvas 采样颜色（方案：亮度分布谷底分割）
   * 对每个文本项，在其中心位置采样 15x15 像素区域
   * 收集所有非透明像素的亮度，按亮度排序后找最大间隔（谷底）
   * 如果最大间隔 > 40，取暗组平均色作为文字色
   * 返回 [{x, y, color: [r, g, b]}] */
  sampleColorsFromCanvas(ctx, viewport, items) {
    const scale = 4.0; /* 高分辨率渲染 */
    const colorMap = [];

    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;

      const pdfX = item.transform[4];
      const pdfY = item.transform[5];

      const canvasX = Math.round(pdfX * scale);
      const canvasY = Math.round(viewport.height - pdfY * scale);

      /* 采样 15x15 区域 */
      const sampleSize = 15;
      const half = Math.floor(sampleSize / 2);
      const x0 = Math.max(half, Math.min(ctx.canvas.width - half - 1, canvasX));
      const y0 = Math.max(half, Math.min(ctx.canvas.height - half - 1, canvasY));

      try {
        const imageData = ctx.getImageData(x0 - half, y0 - half, sampleSize, sampleSize);
        const pixels = imageData.data;

        /* 收集所有非透明像素的亮度 */
        const brightnesses = [];
        const pixelColors = [];

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          if (a < 128) continue; /* 跳过透明像素 */

          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          brightnesses.push(brightness);
          pixelColors.push([r, g, b]);
        }

        if (brightnesses.length < 10) continue;

        /* 按亮度排序 */
        const indexed = brightnesses.map((b, i) => ({ brightness: b, index: i }));
        indexed.sort((a, b) => a.brightness - b.brightness);

        /* 找亮度分布的谷底（最大间隔） */
        let maxGap = 0;
        let gapIndex = -1;
        for (let i = 1; i < indexed.length; i++) {
          const gap = indexed[i].brightness - indexed[i - 1].brightness;
          if (gap > maxGap) {
            maxGap = gap;
            gapIndex = i;
          }
        }

        /* 如果最大间隔 > 40，认为存在两组颜色 */
        let textColor = null;
        if (maxGap > 40 && gapIndex > 0 && gapIndex < indexed.length) {
          /* 取暗组（亮度较低的一组）的平均颜色 */
          const darkGroup = indexed.slice(0, gapIndex);
          let sumR = 0, sumG = 0, sumB = 0;
          for (const entry of darkGroup) {
            const c = pixelColors[entry.index];
            sumR += c[0]; sumG += c[1]; sumB += c[2];
          }
          textColor = [
            sumR / darkGroup.length / 255,
            sumG / darkGroup.length / 255,
            sumB / darkGroup.length / 255
          ];
        } else {
          /* 没有明显分组，取整体平均色 */
          let sumR = 0, sumG = 0, sumB = 0;
          for (const c of pixelColors) {
            sumR += c[0]; sumG += c[1]; sumB += c[2];
          }
          const avgColor = [
            sumR / pixelColors.length / 255,
            sumG / pixelColors.length / 255,
            sumB / pixelColors.length / 255
          ];
          /* 如果平均色接近黑色，直接使用 */
          if (avgColor[0] < 0.3 && avgColor[1] < 0.3 && avgColor[2] < 0.3) {
            textColor = avgColor;
          }
          /* 否则不设置颜色（保持默认黑色） */
        }

        if (textColor) {
          colorMap.push({
            x: pdfX,
            y: pdfY,
            color: textColor
          });
        }
      } catch (e) {
        /* 跳过 */
      }
    }

    return colorMap;
  },

  /* ==================== 颜色匹配到文本项（双源） ==================== */

  /* 双源颜色匹配：优先使用操作符列表结果，Canvas 采样作为补充
   * 操作符列表给出 PDF 中实际指定的颜色值（100% 准确）
   * Canvas 采样作为辅助验证，补充操作符列表未覆盖的项 */
  matchColorsToItemsDual(items, opColorMap, canvasColorMap) {
    /* 第一优先级：操作符列表（100% 准确的颜色值） */
    if (opColorMap && opColorMap.length > 0) {
      for (const item of items) {
        if (!item.str && item.str !== ' ') continue;

        const ix = item.transform[4];
        const iy = item.transform[5];

        let bestDist = Infinity;
        let bestColor = null;

        for (const entry of opColorMap) {
          const dx = Math.abs(ix - entry.x);
          const dy = Math.abs(iy - entry.y);
          if (dx < 15 && dy < 15) {
            const dist = dx + dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestColor = entry.color;
            }
          }
        }

        if (bestColor) {
          item._color = bestColor;
          item._colorSource = 'ops';
        }
      }
    }

    /* 第二优先级：Canvas 采样（补充操作符列表未覆盖的项） */
    if (canvasColorMap && canvasColorMap.length > 0) {
      for (const item of items) {
        if (!item.str && item.str !== ' ') continue;
        if (item._colorSource === 'ops') continue; /* 已有操作符颜色，跳过 */

        const ix = item.transform[4];
        const iy = item.transform[5];

        let bestDist = Infinity;
        let bestColor = null;

        for (const entry of canvasColorMap) {
          const dx = Math.abs(ix - entry.x);
          const dy = Math.abs(iy - entry.y);
          if (dx < 20 && dy < 20) {
            const dist = dx + dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestColor = entry.color;
            }
          }
        }

        if (bestColor) {
          item._color = bestColor;
          item._colorSource = 'canvas';
        }
      }
    }
  },

  /* ==================== 统计分析 ==================== */

  /* 检测正文字号（出现次数最多的字号） */
  detectBodyFontSize(allItems) {
    const fontSizeCount = {};
    for (const item of allItems) {
      if (!item.str || !item.str.trim()) continue;
      const size = Math.round(item._fontSize * 10) / 10; /* 保留一位小数 */
      fontSizeCount[size] = (fontSizeCount[size] || 0) + 1;
    }

    /* 找出现次数最多的字号 */
    let maxCount = 0;
    let bodyFontSize = 11;
    for (const [size, count] of Object.entries(fontSizeCount)) {
      if (count > maxCount) {
        maxCount = count;
        bodyFontSize = parseFloat(size);
      }
    }

    return bodyFontSize;
  },

  /* ==================== 页码删除 ==================== */

  /* 检测并删除 PDF 页码文本（基于内容模式匹配 + 上下文判断，不依赖 Y 坐标） */
  removePageNumbers(items) {
    /* 收集所有非空文本项的信息 */
    const textItems = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (!item.str || !item.str.trim()) continue;
      textItems.push({
        index: idx,
        str: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      });
    }

    /* 按 Y 坐标分组（Y 差 < 5 为同一行） */
    const yGroups = [];
    for (const ti of textItems) {
      let found = false;
      for (const group of yGroups) {
        if (Math.abs(ti.y - group[0].y) < 5) {
          group.push(ti);
          found = true;
          break;
        }
      }
      if (!found) {
        yGroups.push([ti]);
      }
    }

    /* 对每个 Y 组，按 X 坐标排序 */
    for (const group of yGroups) {
      group.sort((a, b) => a.x - b.x);

      /* 拼接整行文本 */
      const lineText = group.map(ti => ti.str).join('');
      const lineTextNoSpace = lineText.replace(/\s/g, '');

      /* 检查页码模式 */
      const patterns = [
        /^\d+$/,                    /* "7" */
        /^第\s*\d+\s*页$/,          /* "第 7 页"（允许空格） */
        /^第\d+页$/,                /* "第7页" */
        /^第\s*\d+\s*頁$/,          /* "第 7 頁" */
        /^第\d+頁$/,                /* "第7頁" */
        /^-\s*\d+\s*-$/,           /* "- 7 -" */
        /^\d+\s*[\/\\]\s*\d+$/,     /* "7 / 25" */
      ];

      let isPageNum = false;
      for (const pattern of patterns) {
        if (pattern.test(lineText) || pattern.test(lineTextNoSpace)) {
          isPageNum = true;
          break;
        }
      }

      if (isPageNum && lineText.length <= 20) {
        /* 标记所有组成文本项为页码 */
        for (const ti of group) {
          items[ti.index]._isPageNumber = true;
          items[ti.index].str = '';
        }
      }
    }
  },

  /* ==================== 行/段落分组 ==================== */

  /* 按行分组：Y 坐标变化 > 3px 为新行，保持 getTextContent 原始顺序 */
  groupItemsByLine(items) {
    if (!items || items.length === 0) return [];

    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of items) {
      if (!item.str && item.str !== ' ') {
        if (item.hasEOL && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
          currentY = null;
        }
        continue;
      }

      /* 跳过已标记为页码的项 */
      if (item._isPageNumber) continue;

      const y = item.transform[5];

      if (currentY === null || Math.abs(y - currentY) > 3) {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        currentY = y;
      } else {
        currentLine.push(item);
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  },

  /* 按段落分组：行间距 > 正文字号 * 2.0 为新段落 */
  groupLinesByParagraph(lines, bodyFontSize) {
    if (lines.length === 0) return [];

    const paragraphs = [];
    let currentPara = [];
    /* 使用更大的阈值（正文字号的 2 倍），避免将同一段落的行拆分 */
    const lineGap = bodyFontSize * 2.0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineY = line[0] ? line[0].transform[5] : 0;

      if (currentPara.length === 0) {
        currentPara = [line];
      } else {
        const prevLine = currentPara[currentPara.length - 1];
        const prevY = prevLine[0] ? prevLine[0].transform[5] : 0;
        const gap = prevY - lineY; /* PDF Y 轴向上，上一行 Y > 下一行 Y */

        if (gap > lineGap) {
          /* 间距大，新段落 */
          paragraphs.push(currentPara);
          currentPara = [line];
        } else {
          currentPara.push(line);
        }
      }
    }

    if (currentPara.length > 0) {
      paragraphs.push(currentPara);
    }

    return paragraphs;
  },

  /* ==================== 标题识别 ==================== */

  /* 检测标题层级（基于字号比例 + 颜色 + 加粗） */
  detectHeadingLevel(fontSize, color, hasBold, allBold, text, bodyFontSize) {
    /* Markdown 标题兼容 */
    const mdMatch = text.match(/^#{1,3}\s+(.+)/);
    if (mdMatch) return mdMatch[1].length;

    /* 空文本或纯数字行不是标题 */
    if (!text || text.trim().length === 0) return 0;
    if (/^\d+$/.test(text.trim())) return 0;

    /* 如果书签存在，检查当前文本是否匹配某个书签标题 */
    const bookmarks = AppState.currentModule && AppState.currentModule.document && AppState.currentModule.document.bookmarks;
    if (bookmarks && bookmarks.length > 0) {
      const trimmed = text.trim();
      for (const bm of bookmarks) {
        if (bm.title === trimmed) {
          return bm.level;
        }
      }
    }

    /* 过长的文本不太可能是标题 */
    if (text.trim().length > 60) return 0;

    /* 基于字号比例 */
    const ratio = fontSize / bodyFontSize;

    if (ratio >= 1.25) return 1;  /* 字号 >= 正文的 1.25 倍 → 一级标题 */
    if (ratio >= 1.1) return 2;   /* 字号 >= 正文的 1.1 倍 → 二级标题 */
    if (ratio >= 1.05 && (hasBold || allBold)) return 3; /* 字号略大且加粗 → 三级标题 */

    /* 基于颜色（非黑色 + 字号不小于正文） */
    if (color && !this.isBlackish(color) && ratio >= 0.95 && text.trim().length <= 40) {
      return 2;
    }

    /* 全加粗 + 字号等于正文 + 短文本 → 可能是三级标题 */
    if (allBold && text.trim().length <= 30 && ratio >= 0.95) {
      return 3;
    }

    return 0; /* 不是标题 */
  },

  /* 判断颜色是否接近黑色 */
  isBlackish(color) {
    if (!color || color.length < 3) return true;
    const [r, g, b] = color;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max - min) < 0.1 && max < 0.2;
  },

  /* 增强标题识别（基于格式信息 + 启发式规则） */
  processHeadingsEnhanced(allItems, bodyFontSize, allText) {
    const headings = [];
    const lines = this.groupItemsByLine(allItems);

    /* 同时保留纯文本的启发式标题识别作为补充 */
    const textHeadings = this.processHeadings(allText);
    const textHeadingSet = new Set();
    for (const h of textHeadings) {
      textHeadingSet.add(h.lineIndex);
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.map(item => item.str).join('').trim();
      if (!trimmed) continue;

      /* 获取这一行的格式特征 */
      const avgFontSize = line.reduce((sum, item) => sum + (item._fontSize || bodyFontSize), 0) / line.length;
      const firstColor = line[0] ? line[0]._color : null;
      const hasBold = line.some(item => item._isBold);
      const allBold = line.length > 0 && line.every(item => item._isBold || !item.str.trim());

      /* Markdown 标题（兼容） */
      const mdMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (mdMatch) {
        headings.push({
          level: mdMatch[1].length,
          text: mdMatch[2].trim(),
          lineIndex: i,
          source: 'markdown'
        });
        continue;
      }

      /* 基于格式信息的标题识别 */
      const headingLevel = this.detectHeadingLevel(avgFontSize, firstColor, hasBold, allBold, trimmed, bodyFontSize);

      if (headingLevel > 0) {
        headings.push({
          level: headingLevel,
          text: trimmed,
          lineIndex: i,
          source: 'format',
          fontSize: avgFontSize,
          color: firstColor
        });
      }
    }

    /* 补充纯文本启发式识别到的标题（格式识别可能遗漏的） */
    for (const h of textHeadings) {
      if (!headings.find(eh => eh.text === h.text)) {
        headings.push({ ...h, source: 'heuristic' });
      }
    }

    /* 按行号排序 */
    headings.sort((a, b) => a.lineIndex - b.lineIndex);

    return headings;
  },

  /* ==================== HTML 渲染 ==================== */

  /* 将带格式的文本项转为 HTML（按页渲染，保留字号、颜色、加粗） */
  itemsToHtml(items, bodyFontSize, pageNum) {
    const lines = this.groupItemsByLine(items);
    const paragraphs = this.groupLinesByParagraph(lines, bodyFontSize);

    let html = '';

    /* 页码标记 */
    html += `<div class="pdf-page-marker" data-page="${pageNum}">`;
    html += `<span class="pdf-page-num">第 ${pageNum} 页</span>`;
    html += `</div>`;

    for (const para of paragraphs) {
      /* 分析第一行的格式特征来判断是否是标题 */
      const firstLine = para[0];
      const firstItem = firstLine[0];
      const lineFontSize = firstItem ? (firstItem._fontSize || bodyFontSize) : bodyFontSize;
      const lineColor = firstItem ? firstItem._color : null;
      const hasBold = firstLine.some(item => item._isBold);
      const allBold = firstLine.length > 0 && firstLine.every(item => item._isBold || !item.str.trim());
      const lineText = firstLine.map(item => item.str).join('').trim();

      /* 检查是否匹配书签标题 */
      const bookmarkMatch = this.findBookmarkMatch(lineText);

      let headingLevel = this.detectHeadingLevel(
        lineFontSize, lineColor, hasBold, allBold, lineText, bodyFontSize
      );

      /* 如果匹配书签，使用书签层级 */
      if (bookmarkMatch) {
        headingLevel = bookmarkMatch.level;
      }

      if (headingLevel > 0) {
        const fixedSize = headingLevel === 1 ? 24 : headingLevel === 2 ? 18 : 15;
        const id = `heading-${this._headingCounter++}`;
        html += `<h${headingLevel} id="${id}" style="font-size:${fixedSize}px;line-height:1.6;margin-top:0.8em;margin-bottom:0.4em">`;
        for (const line of para) {
          for (const item of line) {
            html += this.itemToSpan(item, bodyFontSize, true);
          }
          if (line !== para[para.length - 1]) html += '<br>';
        }
        html += `</h${headingLevel}>`;
      } else {
        html += `<p style="font-size:13px;line-height:1;margin-bottom:0.2em">`;
        for (const line of para) {
          for (const item of line) {
            html += this.itemToSpan(item, bodyFontSize, true);
          }
          if (line !== para[para.length - 1]) html += '<br>';
        }
        html += `</p>`;
      }
    }

    return html;
  },

  /* 将单个文本项转为带格式的 span（不再设置 font-size，字号由父元素控制） */
  itemToSpan(item, bodyFontSize, forceFontSize) {
    if (!item.str && item.str !== ' ') return '';

    let colorStyle = '';
    if (item._color) {
      let r = Math.round(item._color[0] * 255);
      let g = Math.round(item._color[1] * 255);
      let b = Math.round(item._color[2] * 255);

      /* 检测是否接近编辑器背景色或白色，如果是则加深 */
      if (this.isNearBackground(r, g, b)) {
        const darkened = this.darkenColor(r, g, b);
        r = darkened[0]; g = darkened[1]; b = darkened[2];
      }
      colorStyle = `color:rgb(${r},${g},${b});`;
    }

    /* 不再设置 font-size！字号由父元素控制 */
    if (colorStyle) {
      return `<span style="${colorStyle}">${this.escapeHtml(item.str)}</span>`;
    }
    return this.escapeHtml(item.str);
  },

  /* 判断颜色是否接近编辑器背景色或白色 */
  isNearBackground(r, g, b) {
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    return brightness > 220;
  },

  /* 按原始色相比例降低亮度到 40% */
  darkenColor(r, g, b) {
    const factor = 0.4;
    return [
      Math.round(r * factor),
      Math.round(g * factor),
      Math.round(b * factor)
    ];
  },

  /* ==================== 角色数据块识别 ==================== */

  /* 角色数据块识别（基于行扫描 + 关键词密集区域） */
  processCharacterBlocks(text) {
    const characters = [];
    const lines = text.split('\n');
    const keywords = ['护甲等级', 'AC', '生命值', 'HP', '速度',
      '力量', '敏捷', '体质', '智力', '感知', '魅力',
      '挑战等级', 'CR', '技能', '感官', '语言',
      '豁免', '伤害抗性', '伤害免疫', '状态免疫'];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }

      /* 检查当前行是否包含关键词 */
      let hitCount = 0;
      for (const kw of keywords) {
        if (line.includes(kw)) hitCount++;
      }

      if (hitCount >= 2) {
        /* 找到关键词密集行，向前和向后扩展找到完整数据块 */
        let start = i;
        let end = i;

        /* 向前找：找到数据块的开头（通常是角色名称） */
        while (start > 0 && lines[start - 1].trim()) {
          const prevLine = lines[start - 1].trim();
          const prevHasKw = keywords.some(kw => prevLine.includes(kw));
          if (!prevHasKw && prevLine.length <= 50) {
            start--;
          } else {
            break;
          }
        }

        /* 向后找：继续收集包含关键词或短数据行的行 */
        while (end < lines.length - 1) {
          const nextLine = lines[end + 1].trim();
          if (!nextLine) break; /* 空行结束 */
          const nextHasKw = keywords.some(kw => nextLine.includes(kw));
          const isActionLine = nextLine.includes('动作') || nextLine.includes('特性') || nextLine.includes('传奇');
          if (nextHasKw || isActionLine) {
            end++;
          } else if (nextLine.length < 100) {
            /* 短行可能是数据的一部分（如豁免值、技能值） */
            end++;
          } else {
            break;
          }
        }

        /* 提取完整数据块 */
        const blockLines = lines.slice(start, end + 1);
        const rawText = blockLines.join('\n');

        /* 提取角色名：数据块第一行通常是名称 */
        const name = blockLines[0].trim().substring(0, 50) || '未命名角色';

        /* 提取字段 */
        const fields = {};
        for (const bl of blockLines) {
          for (const kw of keywords) {
            if (bl.includes(kw)) {
              const idx = bl.indexOf(kw);
              const after = bl.substring(idx + kw.length).replace(/^[\s:：]+/, '');
              if (after && after.length < 100) {
                fields[kw] = after.substring(0, 50);
              }
            }
          }
        }

        characters.push({ name: name, rawText: rawText, fields: fields });
        i = end + 1;
      } else {
        i++;
      }
    }

    return characters;
  },

  /* ==================== 表格识别 ==================== */

  /* 表格识别 */
  processTables(text) {
    const tables = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      /* 查找包含 | 的行（Markdown 表格） */
      if (line.includes('|') && line.indexOf('|') !== line.lastIndexOf('|')) {
        const tableLines = [line];
        i++;

        /* 检查下一行是否是分隔行（|---|---|） */
        if (i < lines.length && lines[i].trim().match(/^\|[\s\-:|]+\|$/)) {
          tableLines.push(lines[i].trim());
          i++;

          /* 继续收集后续表格行 */
          while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim().indexOf('|') !== lines[i].trim().lastIndexOf('|')) {
            tableLines.push(lines[i].trim());
            i++;
          }

          /* 解析表格 */
          if (tableLines.length >= 2) {
            const header = tableLines[0].split('|').filter(c => c.trim() !== '');
            const rows = [];
            for (let j = 2; j < tableLines.length; j++) {
              const cells = tableLines[j].split('|').filter(c => c.trim() !== '');
              rows.push(cells.map(c => c.trim()));
            }
            tables.push({
              header: header.map(h => h.trim()),
              rows: rows,
              rawText: tableLines.join('\n')
            });
          }
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    return tables;
  },

  /* ==================== 纯文本回退方法（被 DocEditor.loadDocument 调用） ==================== */

  /* 将纯文本转为 HTML（用于渲染到编辑器，支持启发式标题识别）
   * 此方法保留作为回退方案，当文档只有纯文本没有格式信息时使用 */
  textToHtml(text) {
    const lines = text.split('\n');
    let html = '';
    let inTable = false;
    let tableRows = [];

    /* 预计算启发式标题集合，用于快速查找 */
    const headingSet = new Set();
    const headingLevels = {};
    const headingLines = this.processHeadings(text);
    for (const h of headingLines) {
      headingSet.add(h.lineIndex);
      headingLevels[h.lineIndex] = h.level;
    }

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();

      /* 空行 */
      if (!trimmed) {
        if (inTable) {
          html += this.buildTableHtml(tableRows);
          tableRows = [];
          inTable = false;
        }
        continue;
      }

      /* Markdown 标题 */
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        if (inTable) {
          html += this.buildTableHtml(tableRows);
          tableRows = [];
          inTable = false;
        }
        const level = headingMatch[1].length;
        html += `<h${level}>${this.escapeHtml(headingMatch[2])}</h${level}>`;
        continue;
      }

      /* 启发式标题（由 processHeadings 识别到的非 Markdown 标题） */
      if (headingSet.has(idx)) {
        if (inTable) {
          html += this.buildTableHtml(tableRows);
          tableRows = [];
          inTable = false;
        }
        const level = headingLevels[idx];
        html += `<h${level}>${this.escapeHtml(trimmed)}</h${level}>`;
        continue;
      }

      /* Markdown 表格行 */
      if (trimmed.includes('|') && trimmed.indexOf('|') !== trimmed.lastIndexOf('|')) {
        if (trimmed.match(/^\|[\s\-:|]+\|$/)) {
          /* 分隔行，跳过 */
          inTable = true;
          continue;
        }
        const cells = trimmed.split('|').filter(c => c.trim() !== '');
        tableRows.push(cells.map(c => c.trim()));
        inTable = true;
        continue;
      }

      /* 如果之前在表格中，先结束表格 */
      if (inTable && tableRows.length > 0) {
        html += this.buildTableHtml(tableRows);
        tableRows = [];
        inTable = false;
      }

      /* 普通文本行 */
      html += `<p>${this.escapeHtml(trimmed)}</p>`;
    }

    /* 处理末尾未关闭的表格 */
    if (inTable && tableRows.length > 0) {
      html += this.buildTableHtml(tableRows);
    }

    return html;
  },

  /* 标题识别（纯文本启发式规则，用于 textToHtml 回退和补充识别） */
  processHeadings(text) {
    const lines = text.split('\n');
    const headings = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      /* 规则 1：Markdown 风格标题（兼容） */
      const mdMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (mdMatch) {
        headings.push({ level: mdMatch[1].length, text: mdMatch[2].trim(), lineIndex: i });
        continue;
      }

      /* 规则 2：启发式标题识别（短文本 + 后续有较长内容） */
      const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
      const isShort = line.length >= 2 && line.length <= 30;
      const noPunctuation = !line.match(/[。！？；，、]/);
      const notNumbered = !line.match(/^[\d]+[.、)）]/);
      const followedByContent = nextLine.length > 10;

      if (isShort && noPunctuation && notNumbered && followedByContent) {
        let level = 3;
        if (line.length <= 8) level = 1;
        else if (line.length <= 15) level = 2;

        headings.push({ level: level, text: line, lineIndex: i });
      }
    }

    return headings;
  },

  /* ==================== 工具方法 ==================== */

  /* 从表格行数据构建 HTML table */
  buildTableHtml(rows) {
    if (rows.length === 0) return '';
    let html = '<table>';
    /* 第一行作为表头 */
    html += '<thead><tr>';
    for (const cell of rows[0]) {
      html += `<th>${this.escapeHtml(cell)}</th>`;
    }
    html += '</tr></thead>';
    /* 其余行作为表体 */
    if (rows.length > 1) {
      html += '<tbody>';
      for (let i = 1; i < rows.length; i++) {
        html += '<tr>';
        for (const cell of rows[i]) {
          html += `<td>${this.escapeHtml(cell)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody>';
    }
    html += '</table>';
    return html;
  },

  /* HTML 转义 */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

/* ==========================================================================
 * 文档编辑器模块
 * 基于 contentEditable 的富文本编辑器
 * ========================================================================== */
const DocEditor = {
  editorEl: null,
  isDirty: false,
  autoSaveTimer: null,
  tocCollapsed: false,
  _undoStack: [],
  _redoStack: [],
  _fontSizeUndoStack: [],
  _fontSizeRedoStack: [],
  _savedSelection: null,
  _editor: null,
  _readyResolve: null,
  _readyPromise: null,
  _pendingLoad: null,

  /* 等待 TinyMCE 编辑器就绪 */
  ready() {
    if (this._editor && this._editor.initialized) return Promise.resolve();
    if (!this._readyPromise) {
      this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });
    }
    return this._readyPromise;
  },

  /* 初始化 TinyMCE 编辑器 */
  init() {
    this.editorEl = document.getElementById('editorContent');
    if (!this.editorEl) return;
    if (this._initialized) {
      /* 已初始化但编辑器未就绪时，只恢复 DOM 引用不重新 init */
      if (this._editor && this._editor.initialized) return;
      if (this._editor && !this._editor.initialized) return; /* 正在初始化中 */
      /* _initialized 但 _editor 为 null 说明上次正常完成但引用丢失，重新全量初始化 */
      this._initialized = false;
      this._editor = null;
      this._readyPromise = null;
      this._readyResolve = null;
    }
    this._initialized = true;

    /* TinyMCE 可能在 init() 调用时尚未加载（script 异步），等待它可用 */
    const doInit = () => {
      if (typeof tinymce === 'undefined') {
        setTimeout(doInit, 100);
        return;
      }

      const self = this;
      tinymce.init({
        selector: '#editorContent',
        base_url: 'libs/tinymce',
        license_key: 'gpl',
        menubar: false,
        statusbar: false,
        plugins: 'lists link table image code searchreplace',
        toolbar: false, /* 使用自定义工具栏 */
        branding: false,
        elementpath: false,
        resize: false,
        content_style: `
          body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 16px; line-height: 1.8; padding: 20px; }
          body img { max-width: 100%; }
          body a { color: #60a5fa; }
          body table { border-collapse: collapse; width: 100%; }
          body td, body th { border: 1px solid #444; padding: 4px 8px; }
          body p { margin: 0.5em 0; }
          span[data-mce-type=bookmark] { display: none; }
        `,
        extended_valid_elements: 'span[data-mce-type|style|class],source-marker',
        valid_elements: '*[*]',
        setup(editor) {
          self._editor = editor;

          /* 监听内容变更 → 标记脏 + 自动保存 + 更新目录树 */
          const onAnyChange = () => {
            self._markDirty();
            self.scheduleAutoSave();
            clearTimeout(self._tocTimer);
            self._tocTimer = setTimeout(() => { self.renderTocTree(); }, 500);
          };
          editor.on('Change KeyUp Undo Redo SetContent', onAnyChange);

          /* 监听选区变化 → 更新工具栏状态 */
          editor.on('NodeChange', () => {
            self.updateToolbarState();
          });

          /* 监听滚动 → 更新目录树高亮 */
          editor.on('ScrollContent', () => {
            clearTimeout(self._scrollTimer);
            self._scrollTimer = setTimeout(() => { self.updateTocHighlight(); }, 100);
          });

          /* 右键菜单 */
          editor.on('contextmenu', (e) => {
            e.preventDefault();
            self.showContextMenu(e);
          });

          /* 快捷键 */
          editor.on('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
              switch (e.key.toLowerCase()) {
                case 'z': e.preventDefault(); e.shiftKey ? self.redo() : self.undo(); break;
                case 'y': e.preventDefault(); self.redo(); break;
                case 'f':
                  if (AppState.currentPage === 'editor') {
                    e.preventDefault();
                    self.toggleFindReplace();
                  }
                  break;
              }
            }
          });

          /* init 事件：编辑器就绪，resolve ready() */
          editor.on('init', () => {
            if (self._readyResolve) {
              self._readyResolve();
              self._readyResolve = null;
              self._readyPromise = null;
            }
            /* 重放缓存的 loadDocument 调用 */
            if (self._pendingLoad) {
              const mod = self._pendingLoad;
              self._pendingLoad = null;
              self.loadDocument(mod);
            }
          });
        }
      }).catch(() => {
        /* TinyMCE init 失败时清理状态，允许重试 */
        self._initialized = false;
        self._editor = null;
        self._readyPromise = null;
        self._readyResolve = null;
      });
    };

    doInit();

    /* 绑定图片上传 input（在父窗口 DOM 中，保持原有逻辑） */
    const imgInput = document.getElementById('editorImageInput');
    if (imgInput) {
      imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (self._editor) {
            self._editor.focus();
            self._editor.insertContent('<img src="' + ev.target.result + '" />');
          }
        };
        reader.readAsDataURL(file);
        imgInput.value = '';
      });
    }

    /* 点击外部关闭右键菜单和表格面板（在父窗口 DOM 中） */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.editor-context-menu')) this.hideContextMenu();
      if (!e.target.closest('#btnInsertTable') && !e.target.closest('.table-insert-panel')) {
        const panel = document.getElementById('tableInsertPanel');
        if (panel) panel.classList.remove('visible');
      }
    });

    /* 初始化搜索输入框事件 */
    this._initSearchInput();
  },

  /* 自动保存（3秒防抖） */
  scheduleAutoSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveDocument();
    }, 3000);
  },

  /* ========== 工具栏操作 ========== */

  bold() { if (this._editor) { this._editor.execCommand('Bold'); } },
  italic() { if (this._editor) { this._editor.execCommand('Italic'); } },
  underline() { if (this._editor) { this._editor.execCommand('Underline'); } },
  strikethrough() { if (this._editor) { this._editor.execCommand('Strikethrough'); } },

  setHeading(level) {
    if (this._editor) { this._editor.execCommand('FormatBlock', false, level); }
  },

  insertOrderedList() { if (this._editor) { this._editor.execCommand('InsertOrderedList'); } },
  insertUnorderedList() { if (this._editor) { this._editor.execCommand('InsertUnorderedList'); } },
  insertBlockquote() { if (this._editor) { this._editor.execCommand('FormatBlock', false, 'BLOCKQUOTE'); } },
  insertHR() { if (this._editor) { this._editor.execCommand('InsertHorizontalRule'); } },
  undo() {
    if (this._editor) { this._editor.execCommand('Undo'); }
  },
  redo() {
    if (this._editor) { this._editor.execCommand('Redo'); }
  },

  /* 字号预设下拉菜单切换 */
  toggleFontSizeMenu(e) {
    if (e) { e.stopPropagation(); }
    const menu = document.getElementById('fontSizeDropdown');
    if (menu) { menu.classList.toggle('show'); }
  },

  /* 设置固定字号（使用 TinyMCE API + splitText，避免 extractContents 破坏结构） */
  async setFontSize(size) {
    if (!size) return;
    await this.ready();
    const ed = this._editor;
    if (!ed) return;
    const rng = ed.selection.getRng();
    if (!rng || rng.collapsed) return;
    const doc = ed.getDoc();
    const targetPx = parseInt(size) + 'px';

    /* 步骤1：收集选区内所有 textNode */
    const textNodes = [];
    const walker = doc.createTreeWalker(
      rng.commonAncestorContainer.nodeType === 3 ? rng.commonAncestorContainer.parentNode : rng.commonAncestorContainer,
      NodeFilter.SHOW_TEXT, null, false
    );
    let n;
    while ((n = walker.nextNode())) {
      if (rng.intersectsNode(n) && n.textContent.length > 0) textNodes.push(n);
    }
    if (textNodes.length === 0 && rng.commonAncestorContainer.nodeType === 3) {
      textNodes.push(rng.commonAncestorContainer);
    }

    const selectedNodes = [];

    /* 步骤2：splitText 切出选区内部分 */
    textNodes.forEach(tn => {
      let selStart = 0, selEnd = tn.length;
      if (tn === rng.startContainer) selStart = rng.startOffset;
      if (tn === rng.endContainer) selEnd = rng.endOffset;
      let selected = tn;
      if (selEnd < tn.length) tn.splitText(selEnd);
      if (selStart > 0) selected = tn.splitText(selStart);
      selectedNodes.push(selected);
    });

    /* 步骤3：对每个 textNode 设目标字号 */
    selectedNodes.forEach(tn => {
      const el = tn.parentElement;
      if (!el) return;
      if (el.tagName === 'SPAN' && el.style.fontSize) {
        if (el.childNodes.length === 1 && el.firstChild === tn) {
          el.style.fontSize = targetPx;
          el.setAttribute('data-mce-style', 'font-size:' + targetPx);
        } else {
          const newSpan = ed.dom.create('span', { style: 'font-size:' + targetPx });
          el.replaceChild(newSpan, tn);
          newSpan.appendChild(tn);
        }
      } else {
        const span = ed.dom.create('span', { style: 'font-size:' + targetPx });
        el.replaceChild(span, tn);
        span.appendChild(tn);
      }
    });

    ed.undoManager.add();
    this._markDirty();
    ed.nodeChanged();
    ed.focus();

    /* 恢复选区 */
    const live = selectedNodes.filter(nd => nd && nd.isConnected);
    if (live.length > 0) {
      try {
        const newRng = doc.createRange();
        newRng.setStart(live[0], 0);
        const last = live[live.length - 1];
        newRng.setEnd(last, last.length);
        ed.selection.setRng(newRng);
      } catch (_) {}
    }

    this.updateToolbarState();
  },

  /* 增减字号（使用 splitText + undoManager.add，绕开 transact 快照 diff 回退问题） */
  async changeFontSize(delta) {
    console.log('[LOG][changeFontSize] CALLED delta=' + delta);
    await this.ready();
    if (!this._editor) return;
    const ed = this._editor;
    const rng = ed.selection.getRng();
    const DIAG = window.__diagFontSize;
    if (DIAG) console.log('[DIAG-FS][changeFontSize] ===== START delta=' + delta + ' isDirty=' + this.isDirty + ' =====');
    if (DIAG) console.log('[DIAG-FS][changeFontSize] collapsed=' + (rng ? rng.collapsed : 'null') + ' startContainer=' + (rng ? rng.startContainer.nodeName : 'null'));
    if (!rng || rng.collapsed) {
      /* 光标无选区时，对当前所在段落整体操作 */
      const node = ed.selection.getNode();
      if (!node) return;
      const cur = parseInt(ed.dom.getStyle(node, 'font-size', true)) || 16;
      const ns = Math.max(8, Math.min(72, cur + (parseInt(delta) || 0)));
      if (DIAG) console.log('[DIAG-FS][changeFontSize] collapsedPath: cur=' + cur + ' → new=' + ns + ' node=' + node.nodeName);
      ed.dom.setStyle(node, 'font-size', ns + 'px');
      ed.undoManager.add();
      this._markDirty();
      ed.nodeChanged();
      ed.focus();
      this.updateToolbarState();
      if (DIAG) {
        const verify = ed.dom.getStyle(node, 'font-size', true);
        console.log('[DIAG-FS][changeFontSize] collapsedPath VERIFY: domStyle=' + verify + ' isDirty=' + this.isDirty);
      }
      return;
    }
    const doc = ed.getDoc();

    /* 步骤1：收集选区内所有 textNode */
    const textNodes = [];
    const walkerRoot = rng.commonAncestorContainer.nodeType === 3
      ? rng.commonAncestorContainer.parentNode
      : rng.commonAncestorContainer;
    const walker = doc.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walker.nextNode())) {
      if (rng.intersectsNode(n) && n.textContent.length > 0) textNodes.push(n);
    }
    if (textNodes.length === 0 && rng.commonAncestorContainer.nodeType === 3) {
      textNodes.push(rng.commonAncestorContainer);
    }

    const selectedNodes = [];

    /* 不使用 ed.undoManager.transact()：其内部"快照A→改→快照B→diff"机制识别不了
     * 原地 el.style.fontSize 赋值，会把第 2+ 次点击的变更重置回旧快照。
     * 改为直接操作 DOM 后手动 undoManager.add() 记录一步撤销。 */

    /* 步骤2：用 splitText 切出每个 textNode 的"选区内部分" */
    textNodes.forEach(tn => {
      let selStart = 0, selEnd = tn.length;
      if (tn === rng.startContainer) selStart = rng.startOffset;
      if (tn === rng.endContainer) selEnd = rng.endOffset;
      let selected = tn;
      if (selEnd < tn.length) tn.splitText(selEnd);
      if (selStart > 0) selected = tn.splitText(selStart);
      selectedNodes.push(selected);
    });

    /* 步骤3：先批量读取当前字号（读阶段，只读不写，避免读写交替触发多次回流） */
    const fontChanges = selectedNodes.map(tn => {
      const el = tn.parentElement;
      if (!el) return null;
      const cur = parseInt(ed.dom.getStyle(el, 'font-size', true)) || 16;
      const ns = Math.max(8, Math.min(72, cur + (parseInt(delta) || 0)));
      return { tn, el, ns };
    }).filter(Boolean);

    if (DIAG) {
      fontChanges.forEach((fc, i) => {
        console.log('[DIAG-FS][changeFontSize] node[' + i + '] text="' + fc.tn.textContent.substring(0, 30) + '" parent=' + fc.el.tagName + ' cur=' + (parseInt(ed.dom.getStyle(fc.el, 'font-size', true)) || 16) + ' → new=' + fc.ns);
      });
    }

    /* 步骤4：再批量写入（写阶段，只有写操作，浏览器可一次性合并回流） */
    fontChanges.forEach(({ tn, el, ns }) => {
      if (el.tagName === 'SPAN' && el.style.fontSize) {
        if (el.childNodes.length === 1 && el.firstChild === tn) {
          el.style.fontSize = ns + 'px';
          el.setAttribute('data-mce-style', 'font-size:' + ns + 'px');
        } else {
          const newSpan = ed.dom.create('span', { style: 'font-size:' + ns + 'px' });
          el.replaceChild(newSpan, tn);
          newSpan.appendChild(tn);
        }
      } else {
        const span = ed.dom.create('span', { style: 'font-size:' + ns + 'px' });
        el.replaceChild(span, tn);
        span.appendChild(tn);
      }
    });

    /* 手动拍一步撤销快照（替代 transact），绕开问题 */
    ed.undoManager.add();

    this._markDirty();
    ed.nodeChanged();
    ed.focus();

    /* 选区恢复必须在 ed.focus() 之后 */
    const live = selectedNodes.filter(nd => nd && nd.isConnected);
    if (live.length > 0) {
      try {
        const newRng = doc.createRange();
        newRng.setStart(live[0], 0);
        const last = live[live.length - 1];
        newRng.setEnd(last, last.length);
        ed.selection.setRng(newRng);
      } catch (_) {}
    }

    this.updateToolbarState();

    if (DIAG) {
      /* 诊断：只输出修改区域的 HTML 片段，避免 6MB+ 文档撑爆日志 */
      const sampleNode = live.length > 0 ? live[0] : selectedNodes[0];
      if (sampleNode && sampleNode.parentElement) {
        const domSize = ed.dom.getStyle(sampleNode.parentElement, 'font-size', true);
        const html = sampleNode.parentElement.outerHTML.substring(0, 500);
        console.log('[DIAG-FS][changeFontSize] VERIFY domFontSize=' + domSize + ' parentHTML=' + html);
        /* 存储修改关键词，供 saveDocument/loadDocument 精准搜索 */
        this._diagLastModifiedText = sampleNode.textContent.substring(0, 20);
        this._diagLastModifiedSize = domSize;
      }
      console.log('[DIAG-FS][changeFontSize] DONE isDirty=' + this.isDirty + ' undoLevels=' + (ed.undoManager ? ed.undoManager.hasUndo() : '?'));
    }
  },

  /* 字号专用的 undo/redo 已删除，直接走 TinyMCE 统一历史栈（保留函数签名兼容） */
  undoFontSize() { return this.undo(); },
  redoFontSize() { return this.redo(); },

  /* 序列化当前选区信息（用于调试/扩展） */
  _serializeSelection(sel) {
    if (!sel || !sel.rangeCount) return '';
    try {
      const range = sel.getRangeAt(0);
      return range.toString();
    } catch (e) { return ''; }
  },

  /* 递归清理片段内所有子元素的 font-size 内联样式，使外层 span 的 font-size 统一生效 */
  _clearInnerFontSize(node) {
    if (node.nodeType === 1) { /* Element */
      if (node.style && node.style.fontSize) {
        node.style.removeProperty('font-size');
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        this._clearInnerFontSize(node.childNodes[i]);
      }
    }
  },

  /* 从 Range 中收集所有不同的字号值 */
  _getFontSizesFromRange(range) {
    const sizes = new Set();
    let root = range.commonAncestorContainer;
    if (root.nodeType === 3) root = root.parentElement;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    while (textNode = walker.nextNode()) {
      if (range.intersectsNode(textNode)) {
        const el = textNode.parentElement;
        if (el) {
          const fs = window.getComputedStyle(el).fontSize;
          sizes.add(parseInt(fs));
        }
      }
    }
    return Array.from(sizes);
  },

  /* 混合字号场景：预处理拆分边界 span + 三遍扫描，各自调整，保留相对大小关系 */
  _adjustMixedFontSizes(range, delta) {
    if (!range || range.collapsed) return;

    let root = range.commonAncestorContainer;
    if (root.nodeType === 3) root = root.parentElement;
    if (!root) return;

    const originalRange = range.cloneRange();
    const doc = root.ownerDocument;
    const modifiedNodes = [];

    /* 预处理：拆分被选区边界穿过的 font-size span，防止调整"溢出"到选区外 */
    const boundarySpans = [];
    const bsWalker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    }, false);
    let bsNode;
    while (bsNode = bsWalker.nextNode()) {
      if (bsNode.tagName === 'SPAN' && bsNode.style.fontSize) {
        const startsBefore = range.compareBoundaryPoints(Range.START_TO_START,
          (() => { const r = doc.createRange(); r.selectNodeContents(bsNode); return r; })()
        ) > 0;
        const endsAfter = range.compareBoundaryPoints(Range.END_TO_END,
          (() => { const r = doc.createRange(); r.selectNodeContents(bsNode); return r; })()
        ) < 0;
        if (startsBefore || endsAfter) {
          boundarySpans.push(bsNode);
        }
      }
    }

    /* 从后往前拆分，避免偏移影响前面的节点 */
    for (let i = boundarySpans.length - 1; i >= 0; i--) {
      const span = boundarySpans[i];
      if (!span.parentNode) continue;
      const parent = span.parentNode;
      const fontSize = span.style.fontSize;
      const textContent = span.textContent;

      const isStart = (originalRange.startContainer === span || span.contains(originalRange.startContainer));
      const isEnd = (originalRange.endContainer === span || span.contains(originalRange.endContainer));

      let startOff = 0, endOff = textContent.length;
      if (isStart && originalRange.startContainer.nodeType === 3 && span.contains(originalRange.startContainer)) {
        const tmpRange = doc.createRange();
        tmpRange.selectNodeContents(span);
        tmpRange.setEnd(originalRange.startContainer, originalRange.startOffset);
        startOff = tmpRange.toString().length;
      }
      if (isEnd && originalRange.endContainer.nodeType === 3 && span.contains(originalRange.endContainer)) {
        const tmpRange = doc.createRange();
        tmpRange.selectNodeContents(span);
        tmpRange.setEnd(originalRange.endContainer, originalRange.endOffset);
        endOff = tmpRange.toString().length;
      }

      if (startOff === 0 && endOff === textContent.length) continue;

      const beforeText = textContent.substring(0, startOff);
      const midText = textContent.substring(startOff, endOff);
      const afterText = textContent.substring(endOff);

      const fragment = doc.createDocumentFragment();
      if (beforeText) {
        const s = doc.createElement('span');
        s.style.fontSize = fontSize;
        s.textContent = beforeText;
        fragment.appendChild(s);
      }
      if (midText) {
        const s = doc.createElement('span');
        s.style.fontSize = fontSize;
        s.textContent = midText;
        fragment.appendChild(s);
      }
      if (afterText) {
        const s = doc.createElement('span');
        s.style.fontSize = fontSize;
        s.textContent = afterText;
        fragment.appendChild(s);
      }
      parent.replaceChild(fragment, span);
    }

    /* 第一遍：原地调整选区内所有已有 fontSize 的 span（边界已拆分，不会溢出） */
    const elemWalker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    }, false);
    let node;
    while (node = elemWalker.nextNode()) {
      if (node.tagName === 'SPAN' && node.style.fontSize) {
        const cur = parseInt(node.style.fontSize);
        if (cur > 0) {
          const adjusted = Math.max(8, Math.min(48, cur + delta)) + 'px';
          if (node.style.fontSize !== adjusted) {
            node.style.fontSize = adjusted;
            modifiedNodes.push(node);
          }
        }
      }
    }

    /* 第二遍：收集未被 fontSize span 包裹的裸文本节点 */
    const bareTextNodes = [];
    const textWalker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    while (node = textWalker.nextNode()) {
      if (!node.textContent.trim()) continue;
      if (!range.intersectsNode(node)) continue;
      let inside = false;
      let p = node.parentElement;
      while (p && p !== root) {
        if (p.tagName === 'SPAN' && p.style.fontSize) { inside = true; break; }
        p = p.parentElement;
      }
      if (inside) continue;
      bareTextNodes.push(node);
    }

    /* 第三遍：从后往前包裹裸文本节点（避免位置偏移影响前面的节点） */
    for (let i = bareTextNodes.length - 1; i >= 0; i--) {
      const textNode = bareTextNodes[i];
      const parent = textNode.parentElement;
      if (!parent) continue;

      const computedSize = getComputedStyle(parent).fontSize;
      const curInt = parseInt(computedSize);
      if (curInt <= 0) continue;

      const newSize = Math.max(8, Math.min(48, curInt + delta)) + 'px';

      const isStart = (originalRange.startContainer === textNode);
      const isEnd = (originalRange.endContainer === textNode);
      const startOff = isStart ? originalRange.startOffset : 0;
      const endOff = isEnd ? originalRange.endOffset : textNode.length;

      if (startOff === 0 && endOff === textNode.length) {
        /* 整个文本节点都在选区内，直接包裹 */
        const span = doc.createElement('span');
        span.style.fontSize = newSize;
        parent.insertBefore(span, textNode);
        span.appendChild(textNode);
        modifiedNodes.push(span);
      } else {
        /* 部分选中：先切尾部再切头部，拿到中间段包裹 */
        if (endOff < textNode.length) {
          textNode.splitText(endOff);
        }
        const midNode = startOff > 0 ? textNode.splitText(startOff) : textNode;
        if (midNode.length > 0) {
          const span = doc.createElement('span');
          span.style.fontSize = newSize;
          parent.insertBefore(span, midNode);
          span.appendChild(midNode);
          modifiedNodes.push(span);
        }
      }
    }

    /* ── 恢复选区：覆盖所有被修改/包裹的节点 ── */
    if (modifiedNodes.length > 0) {
      modifiedNodes.sort((a, b) => {
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
      const newRange = doc.createRange();
      newRange.setStartBefore(modifiedNodes[0]);
      newRange.setEndAfter(modifiedNodes[modifiedNodes.length - 1]);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  },

  /* 设置字体颜色 */
  async setFontColor(color) {
    await this.ready();
    if (!this._editor) return;
    const ed = this._editor;
    ed.execCommand('ForeColor', false, color);
    ed.focus();
    this._markDirty();
    this.updateToolbarState();
  },

  _cleanEmptySpans() {
    if (!this._editor) return;
    const ed = this._editor;
    const doc = ed.getDoc();
    const spans = doc.querySelectorAll('span:empty');
    spans.forEach(el => {
      if (!el.textContent.trim() && !el.querySelector('*')) {
        el.parentNode.removeChild(el);
      }
    });
  },

  /* 行距撤销栈操作 */
  _pushUndo(action) {
    this._undoStack.push(action);
    this._redoStack = [];
  },

  undoLineHeight() {
    if (this._undoStack.length === 0) return;
    const action = this._undoStack.pop();
    action.elements.forEach(el => {
      el.style.lineHeight = action.oldValue;
    });
    this._redoStack.push(action);
  },

  redoLineHeight() {
    if (this._redoStack.length === 0) return;
    const action = this._redoStack.pop();
    action.elements.forEach(el => {
      el.style.lineHeight = action.newValue;
    });
    this._undoStack.push(action);
  },

  /* 设置行距 */
  async setLineHeight(value) {
    if (!value) return;
    await this.ready();
    const ed = this._editor;
    if (!ed) return;
    const node = ed.selection.getNode();
    if (!node) return;
    ed.dom.setStyle(node, 'line-height', value);
    ed.undoManager.add();
    this._markDirty();
    this.updateToolbarState();
  },

  /* 更新工具栏状态（同步选区格式） */
  updateToolbarState() {
    if (!this._editor || !this._editor.initialized) return;
    const ed = this._editor;
    const node = ed.selection.getNode();
    if (!node) return;

    /* 1. 加粗状态 */
    const isBold = ed.queryCommandState('Bold');
    this._toggleBtnActive('btnBold', isBold);

    /* 2. 斜体状态 */
    const isItalic = ed.queryCommandState('Italic');
    this._toggleBtnActive('btnItalic', isItalic);

    /* 3. 下划线状态 */
    const isUnderline = ed.queryCommandState('Underline');
    this._toggleBtnActive('btnUnderline', isUnderline);

    /* 4. 字号 */
    const fontSizeInput = document.getElementById('fontSizeInput');
    if (fontSizeInput) {
      const computedSize = this._getSelectedFontSize();
      if (computedSize === -1) {
        /* 选区包含多种字号 */
        fontSizeInput.value = '';
        fontSizeInput.placeholder = '?';
      } else if (computedSize > 0) {
        fontSizeInput.value = computedSize;
      } else {
        fontSizeInput.value = '';
        fontSizeInput.placeholder = '字号';
      }
    }

    /* 5. 字体颜色 */
    const colorBtn = document.querySelector('.toolbar-color-btn');
    if (colorBtn) {
      const selColor = this._getSelectedColor();
      if (selColor) {
        const hex = selColor.startsWith('rgb') ? this._rgbToHex(selColor) : selColor;
        colorBtn.style.backgroundColor = hex;
        colorBtn.style.borderColor = hex;
        const colorPicker = document.getElementById('fontColorPicker');
        if (colorPicker) colorPicker.value = hex;
      } else {
        colorBtn.style.backgroundColor = '';
        colorBtn.style.borderColor = '';
        const colorPicker = document.getElementById('fontColorPicker');
        if (colorPicker) colorPicker.value = '#333333';
      }
    }
  },

  _toggleBtnActive(btnId, isActive) {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.classList.toggle('active', isActive);
    }
  },

  /* 获取选中文字的字号（返回 -1 表示混合字号，null 表示无信息） */
  _getSelectedFontSize() {
    if (!this._editor) return null;
    const ed = this._editor;
    const rng = ed.selection.getRng();
    if (!rng || rng.collapsed) {
      /* 无选区时，获取光标所在节点字号 */
      const node = ed.selection.getNode();
      if (!node) return null;
      const fs = ed.dom.getStyle(node, 'font-size', true);
      if (fs) return parseInt(fs);
      return null;
    }

    /* 有选区时，遍历所有 textNode 检测是否混合字号 */
    const doc = ed.getDoc();
    const walkerRoot = rng.commonAncestorContainer.nodeType === 3
      ? rng.commonAncestorContainer.parentNode
      : rng.commonAncestorContainer;
    const walker = doc.createTreeWalker(walkerRoot, NodeFilter.SHOW_TEXT, null, false);
    
    let foundSize = null;
    let n;
    while ((n = walker.nextNode())) {
      if (!rng.intersectsNode(n) || n.textContent.trim().length === 0) continue;
      const el = n.parentElement;
      if (!el) continue;
      const fs = ed.dom.getStyle(el, 'font-size', true);
      if (!fs) continue;
      const size = parseInt(fs);
      if (foundSize === null) {
        foundSize = size;
      } else if (foundSize !== size) {
        return -1; /* 混合字号 */
      }
    }
    return foundSize;
  },

  _getSelectedColor() {
    if (!this._editor) return null;
    const ed = this._editor;
    const node = ed.selection.getNode();
    if (!node || node === ed.getBody()) return null;
    return ed.dom.getStyle(node, 'color', true) || null;
  },

  _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  },

  _rgbToHex(rgb) {
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return '#333333';
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, 0)).join('');
  },

  resetToolbarState() {
    /* 重置所有工具栏按钮的 active 状态 */
    const boldBtn = document.getElementById('btnBold');
    if (boldBtn) boldBtn.classList.remove('active');
    const italicBtn = document.getElementById('btnItalic');
    if (italicBtn) italicBtn.classList.remove('active');
    const underlineBtn = document.getElementById('btnUnderline');
    if (underlineBtn) underlineBtn.classList.remove('active');

    /* 重置字号输入框 */
    const fontSizeInputRst = document.getElementById('fontSizeInput');
    if (fontSizeInputRst) { fontSizeInputRst.value = ''; fontSizeInputRst.placeholder = '字号'; }

    /* 重置颜色按钮 */
    const colorBtn = document.querySelector('.toolbar-color-btn');
    if (colorBtn) {
      colorBtn.style.backgroundColor = '';
      colorBtn.style.borderColor = '';
    }
    const colorPicker = document.getElementById('fontColorPicker');
    if (colorPicker) colorPicker.value = '#333333';

    /* 重置行距选择 */
    const lineHeightSelect = document.getElementById('lineHeightSelect');
    if (lineHeightSelect) lineHeightSelect.value = '';
  },

  /* 标记编辑器内容已修改并触发自动保存 */
  _markDirty() {
    this.isDirty = true;
    this.scheduleAutoSave();
  },

  indent() { if (this._editor) { this._editor.execCommand('Indent'); } },
  outdent() { if (this._editor) { this._editor.execCommand('Outdent'); } },

  /* 设置编辑器缩放 */
  setZoom(value) {
    const scale = value / 100;
    const editorContent = document.getElementById('editorContent');
    if (editorContent) {
      editorContent.style.zoom = scale;
    }
    const label = document.getElementById('editorZoomLabel');
    if (label) label.textContent = value + '%';
  },

  /* 插入图片 */
  insertImage() {
    document.getElementById('editorImageInput').click();
  },

  /* 切换表格插入面板 */
  toggleTablePanel() {
    const panel = document.getElementById('tableInsertPanel');
    if (panel) panel.classList.toggle('visible');
  },

  /* 确认插入表格 */
  confirmInsertTable() {
    const rows = parseInt(document.getElementById('tableRows').value) || 3;
    const cols = parseInt(document.getElementById('tableCols').value) || 3;
    const clampedRows = Math.max(1, Math.min(20, rows));
    const clampedCols = Math.max(1, Math.min(10, cols));

    let html = '<table><thead><tr>';
    for (let c = 0; c < clampedCols; c++) {
      html += `<th>标题${c + 1}</th>`;
    }
    html += '</tr></thead><tbody>';
    for (let r = 0; r < clampedRows - 1; r++) {
      html += '<tr>';
      for (let c = 0; c < clampedCols; c++) {
        html += '<td><br></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br></p>';

    if (!this._editor) return;
    this._editor.focus();
    this._editor.execCommand('mceInsertContent', false, html);

    /* 关闭面板 */
    const panel = document.getElementById('tableInsertPanel');
    if (panel) panel.classList.remove('visible');
  },

  /* ========== 增强搜索系统 ========== */

  /* 搜索状态 */
  _searchMatches: [],       // 所有匹配的 mark 元素
  _searchCurrentIndex: -1,  // 当前选中的匹配索引
  _searchRegex: false,      // 是否启用正则
  _searchHistory: [],       // 搜索历史
  _searchDebounceTimer: null,

  /* 切换查找替换栏 */
  toggleFindReplace() {
    const bar = document.getElementById('findReplaceBar');
    if (!bar) return;
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
      document.getElementById('findInput').focus();
    } else {
      this._clearSearchHighlights();
    }
  },

  /* 切换正则模式 */
  toggleRegex() {
    this._searchRegex = !this._searchRegex;
    const btn = document.getElementById('frRegexBtn');
    if (btn) btn.classList.toggle('active', this._searchRegex);
    this.performSearch();
  },

  /* 执行搜索：在 TinyMCE 内部文档中遍历所有文本节点，用 <mark> 包裹匹配 */
  performSearch() {
    if (!this._editor) return;
    this._clearSearchHighlights();
    const input = document.getElementById('findInput');
    const query = input ? input.value.trim() : '';
    if (!query) {
      this._updateSearchCount();
      return;
    }

    // 添加到搜索历史
    this._addToSearchHistory(query);

    // 构建正则/文本匹配
    let regex;
    try {
      if (this._searchRegex) {
        regex = new RegExp(query, 'gi');
      } else {
        regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      }
    } catch (e) {
      // 正则语法错误，静默
      return;
    }

    const ed = this._editor;
    const doc = ed.getDoc();
    const body = ed.getBody();

    // 遍历 TinyMCE 内部文档中所有文本节点
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // 跳过已有的 mark.search-match 内的文本（避免嵌套标记）
        if (node.parentElement && node.parentElement.closest('mark.search-match')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent.trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }, false);

    const textNodes = [];
    let n;
    while (n = walker.nextNode()) textNodes.push(n);

    // 在每个文本节点中查找匹配
    for (const textNode of textNodes) {
      const text = textNode.textContent;
      const matches = [];
      let m;
      regex.lastIndex = 0;
      while ((m = regex.exec(text)) !== null) {
        if (m[0].length === 0) { regex.lastIndex++; continue; }
        matches.push({ index: m.index, length: m[0].length });
      }
      // 从后往前替换，避免偏移问题
      for (let i = matches.length - 1; i >= 0; i--) {
        const { index, length } = matches[i];
        const range = doc.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + length);
        const mark = doc.createElement('mark');
        mark.className = 'search-match';
        range.surroundContents(mark);
      }
    }

    // 收集所有匹配
    this._searchMatches = Array.from(body.querySelectorAll('mark.search-match'));
    this._searchCurrentIndex = this._searchMatches.length > 0 ? 0 : -1;
    this._highlightCurrentMatch();
    this._updateSearchCount();
  },

  /* 清除 TinyMCE 内部文档中所有搜索高亮 */
  _clearSearchHighlights() {
    if (!this._editor) return;
    const body = this._editor.getBody();
    const marks = body.querySelectorAll('mark.search-match');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
    });
    this._searchMatches = [];
    this._searchCurrentIndex = -1;
  },

  /* 高亮当前匹配项并滚动到位置 */
  _highlightCurrentMatch() {
    // 移除之前的高亮
    this._searchMatches.forEach(m => m.classList.remove('search-match-current'));
    if (this._searchCurrentIndex >= 0 && this._searchCurrentIndex < this._searchMatches.length) {
      const current = this._searchMatches[this._searchCurrentIndex];
      current.classList.add('search-match-current');
      current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  /* 更新匹配计数显示 */
  _updateSearchCount() {
    const countEl = document.getElementById('findCount');
    if (!countEl) return;
    if (this._searchMatches.length === 0) {
      const query = document.getElementById('findInput');
      countEl.textContent = (query && query.value.trim()) ? '无匹配' : '';
    } else {
      countEl.textContent = `${this._searchCurrentIndex + 1}/${this._searchMatches.length}`;
    }
  },

  /* 查找下一个 */
  findNext() {
    if (this._searchMatches.length === 0) {
      this.performSearch();
      return;
    }
    this._searchCurrentIndex = (this._searchCurrentIndex + 1) % this._searchMatches.length;
    this._highlightCurrentMatch();
    this._updateSearchCount();
  },

  /* 查找上一个 */
  findPrev() {
    if (this._searchMatches.length === 0) {
      this.performSearch();
      return;
    }
    this._searchCurrentIndex = (this._searchCurrentIndex - 1 + this._searchMatches.length) % this._searchMatches.length;
    this._highlightCurrentMatch();
    this._updateSearchCount();
  },

  /* 替换当前选中 */
  replaceCurrent() {
    if (!this._editor) return;
    const searchText = document.getElementById('findInput').value;
    const replaceText = document.getElementById('replaceInput').value;
    if (!searchText || this._searchCurrentIndex < 0) return;

    const current = this._searchMatches[this._searchCurrentIndex];
    if (!current) return;

    const ed = this._editor;
    const doc = ed.getDoc();

    // 用替换文本替换 mark 元素
    const parent = current.parentNode;
    parent.replaceChild(doc.createTextNode(replaceText), current);
    parent.normalize();
    this._markDirty();

    // 重新搜索以更新匹配列表
    this.performSearch();
  },

  /* 全部替换 */
  replaceAll() {
    if (!this._editor) return;
    const searchText = document.getElementById('findInput').value;
    const replaceText = document.getElementById('replaceInput').value;
    if (!searchText) return;

    // 先清除标记
    this._clearSearchHighlights();

    const ed = this._editor;
    const doc = ed.getDoc();

    // 使用临时 div 进行文本替换
    const tempDiv = doc.createElement('div');
    tempDiv.innerHTML = ed.getContent();
    if (this._searchRegex) {
      try {
        const regex = new RegExp(searchText, 'g');
        this._replaceTextRegexInNode(tempDiv, regex, replaceText);
      } catch (e) { return; }
    } else {
      this.replaceTextInNode(tempDiv, searchText, replaceText);
    }
    ed.setContent(tempDiv.innerHTML);
    this._markDirty();

    // 重新搜索（应该无匹配）
    this.performSearch();
    const countEl = document.getElementById('findCount');
    if (countEl) countEl.textContent = '已全部替换';
  },

  /* 正则替换文本节点 */
  _replaceTextRegexInNode(node, regex, replace) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (regex.test(node.textContent)) {
        node.textContent = node.textContent.replace(regex, replace);
      }
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        this._replaceTextRegexInNode(node.childNodes[i], regex, replace);
      }
    }
  },

  /* 递归替换文本节点中的文本 */
  replaceTextInNode(node, search, replace) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.includes(search)) {
        node.textContent = node.textContent.split(search).join(replace);
      }
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        this.replaceTextInNode(node.childNodes[i], search, replace);
      }
    }
  },

  /* 搜索历史管理 */
  _addToSearchHistory(query) {
    if (!query) return;
    // 去重
    this._searchHistory = this._searchHistory.filter(h => h !== query);
    this._searchHistory.unshift(query);
    if (this._searchHistory.length > 10) this._searchHistory.pop();
  },

  /* 显示搜索历史下拉 */
  _showFindHistoryDropdown() {
    const dropdown = document.getElementById('findHistoryDropdown');
    if (!dropdown || this._searchHistory.length === 0) {
      if (dropdown) dropdown.classList.remove('visible');
      return;
    }
    dropdown.innerHTML = this._searchHistory.map(h =>
      `<div class="fr-history-item" onmousedown="DocEditor._selectSearchHistory('${h.replace(/'/g, "\\'")}')">
        <span class="fr-hist-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
        ${h}
      </div>`
    ).join('');
    dropdown.classList.add('visible');
  },

  _selectSearchHistory(query) {
    const input = document.getElementById('findInput');
    if (input) input.value = query;
    const dropdown = document.getElementById('findHistoryDropdown');
    if (dropdown) dropdown.classList.remove('visible');
    this.performSearch();
  },

  /* 初始化搜索输入框事件 */
  _initSearchInput() {
    const input = document.getElementById('findInput');
    if (!input) return;

    // 实时搜索（防抖 300ms）
    input.addEventListener('input', () => {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => this.performSearch(), 300);
    });

    // Enter 下一个，Shift+Enter 上一个
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.findPrev();
        else this.findNext();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.toggleFindReplace();
      }
    });

    // 聚焦时显示搜索历史
    input.addEventListener('focus', () => {
      setTimeout(() => this._showFindHistoryDropdown(), 100);
    });

    // 点击外部关闭历史下拉
    input.addEventListener('blur', () => {
      setTimeout(() => {
        const dropdown = document.getElementById('findHistoryDropdown');
        if (dropdown) dropdown.classList.remove('visible');
      }, 200);
    });
  },

  /* ========== 右键菜单 ========== */

  showContextMenu(e) {
    const menu = document.getElementById('editorContextMenu');
    if (!menu) return;

    // 动态生成数据库类型网格
    const ctxDbGrid = document.getElementById('ctxDbGrid');
    if (ctxDbGrid) {
      const dbConfig = DatabaseManager.getMergedDbConfig();
      let html = '';
      for (const [key, cfg] of Object.entries(dbConfig)) {
        html += `<div class="ctx-db-cell" data-db="${key}" onclick="DocEditor.addToDatabase('${key}'); DocEditor.hideContextMenu();" title="${cfg.name}库">`;
        html += `<svg class="db-icon"><use href="#${cfg.icon}"/></svg>`;
        html += `<span class="db-label">${cfg.name}</span>`;
        html += `</div>`;
      }
      ctxDbGrid.innerHTML = html;
    }

    // 保存当前选区
    if (this._editor && this._editor.initialized) {
      const rng = this._editor.selection.getRng();
      if (rng) this._savedRange = rng.cloneRange();
    }

    menu.classList.add('visible');

    /* 确保菜单不超出视口（先显示再计算） */
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      let left = e.clientX;
      let top = e.clientY;
      
      // 右边超出
      if (left + rect.width > window.innerWidth - 8) {
        left = window.innerWidth - rect.width - 8;
      }
      // 下边超出
      if (top + rect.height > window.innerHeight - 8) {
        top = window.innerHeight - rect.height - 8;
      }
      // 左边超出
      if (left < 8) left = 8;
      // 上边超出
      if (top < 8) top = 8;
      
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    });
  },

  hideContextMenu() {
    const menu = document.getElementById('editorContextMenu');
    if (menu) menu.classList.remove('visible');
  },

  ctxAction(action) {
    if (!this._editor) return;
    const ed = this._editor;
    ed.focus();
    if (action === 'cut') ed.execCommand('Cut');
    else if (action === 'copy') ed.execCommand('Copy');
    else if (action === 'paste') ed.execCommand('Paste');
    this.hideContextMenu();
  },

  /* ========== 角色/怪物文本解析 ========== */

  /**
   * 解析 D&D 风格的角色/怪物数据块文本为结构化字段
   * 支持多种格式：标准 stat block、表格格式、带分隔线格式、带前置叙述文本格式
   * 返回 { name, enName, size, type, alignment, ac, hp, speed, str, dex, con, int, wis, cha,
   *        skill, immune, resistant, senses, languages, cr, traits, actions, other }
   */
  parseCharacterText(text) {
    const result = {
      name: '', enName: '', size: '', type: '', alignment: '',
      ac: '', initiative: '', hp: '', speed: '',
      str: '', dex: '', con: '', int: '', wis: '', cha: '',
      skill: '', immune: '', resistant: '', senses: '', languages: '', cr: '',
      traits: [], actions: [], other: ''
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^[-—–]+$/.test(l));
    if (lines.length === 0) return result;

    let lineIdx = 0;

    /* ---- 第1行：名称（中英文拆分）---- */
    const nameLine = lines[lineIdx] || '';
    // 尝试括号格式："中文名（英文名）"
    const nameParenMatch = nameLine.match(/^(.+?)[（(](.+?)[）)]$/);
    if (nameParenMatch) {
      result.name = nameParenMatch[1].trim();
      result.enName = nameParenMatch[2].trim();
    } else {
      // 按中文/英文边界拆分："幽灵Specter" → "幽灵" + "Specter"
      const cnEnSplit = nameLine.match(/^([\u4e00-\u9fff\uff01-\uff5e]+)([a-zA-Z][a-zA-Z\s]*)$/);
      if (cnEnSplit) {
        result.name = cnEnSplit[1].trim();
        result.enName = cnEnSplit[2].trim();
      } else {
        // 按空格拆分，最后一段纯英文则为英文名
        const parts = nameLine.split(/\s+/);
        if (parts.length >= 2 && /^[a-zA-Z]/.test(parts[parts.length - 1])) {
          result.enName = parts.pop();
          result.name = parts.join(' ');
        } else {
          result.name = nameLine.substring(0, 60);
        }
      }
    }
    lineIdx++;

    /* ---- 第2行：体型/类型/阵营 ---- */
    if (lineIdx < lines.length) {
      const typeLine = lines[lineIdx];
      const sizeKeywords = ['微型', '超微型', '小型', '中型', '大型', '巨型', '超巨型'];
      const foundSize = sizeKeywords.find(s => typeLine.includes(s));
      if (foundSize) {
        result.size = foundSize;
        let rest = typeLine.replace(foundSize, '').trim();
        const typeParts = rest.split(/[,，;；]\s*/);
        if (typeParts.length >= 2) {
          result.type = typeParts[0].trim();
          result.alignment = typeParts.slice(1).join('，').trim();
        } else {
          result.type = rest;
        }
        lineIdx++;
      }
    }

    /* ---- 逐行解析剩余数据 ---- */
    const otherLines = [];
    let currentSection = null; // 'traits' | 'actions' | null
    let foundCR = false;
    let pendingEntry = null; // 当前正在构建的特质/动作条目
    const sectionMap = {
      '特质': 'traits', '特性': 'traits',
      '动作': 'actions', '行动': 'actions',
      '反应': 'actions', '传奇动作': 'actions',
      '巢穴动作': 'actions'
    };

    const finalizePending = () => {
      if (pendingEntry) {
        if (currentSection === 'traits') {
          result.traits.push(pendingEntry);
        } else if (currentSection === 'actions') {
          result.actions.push(pendingEntry);
        }
        pendingEntry = null;
      }
    };

    while (lineIdx < lines.length) {
      const line = lines[lineIdx];

      /* 检查是否是段落标题（如"动作"、"特质Traits"等） */
      const sectionTitle = Object.keys(sectionMap).find(k => new RegExp(`^${k}`).test(line));
      if (sectionTitle) {
        finalizePending();
        currentSection = sectionMap[sectionTitle];
        lineIdx++;
        continue;
      }

      /* AC（可能和先攻同行） */
      const acMatch = line.match(/AC[：:]?\s*(\d+)(?:\s*[（(](.+?)[）)])?/i) || line.match(/护甲等级[：:]?\s*(\d+)(?:\s*[（(](.+?)[）)])?/);
      if (acMatch) {
        result.ac = acMatch[1] + (acMatch[2] ? `（${acMatch[2]}）` : '');
        // 不立即 continue，同一行继续检查先攻
      }

      /* 先攻 */
      const initMatch = line.match(/先攻[：:]?\s*([+-]?\d+)/i);
      if (initMatch) {
        result.initiative = initMatch[1];
      }

      /* HP/生命值 */
      const hpMatch = line.match(/(?:HP|生命值)[：:]?\s*(\d+)(?:\s*[（(](.+?)[）)])?/i);
      if (hpMatch) {
        result.hp = hpMatch[1] + (hpMatch[2] ? `（${hpMatch[2]}）` : '');
        lineIdx++;
        continue;
      }

      /* 速度（整行内容，含多种移动方式） */
      const speedMatch = line.match(/速度[：:]?\s*(.+)/);
      if (speedMatch) {
        result.speed = speedMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 属性全局扫描（支持表格格式和多行格式） */
      const abilityKeywords = [
        { key: '力量', field: 'str' },
        { key: '敏捷', field: 'dex' },
        { key: '体质', field: 'con' },
        { key: '智力', field: 'int' },
        { key: '感知', field: 'wis' },
        { key: '魅力', field: 'cha' }
      ];
      for (const ab of abilityKeywords) {
        // 匹配 "力量21（+5）" 或 "力量\t7\t-2" 等格式
        const regex = new RegExp(`${ab.key}[\\s:：]*(\\d+)\\s*[（(]?([+-]?\\d+)?[）)]?`, 'g');
        let match;
        while ((match = regex.exec(line)) !== null) {
          // 取第一个数字作为属性值（如果是表格格式，第一个数字是调整值）
          const value = match[1];
          const mod = match[2] ? `（${match[2]}）` : '';
          result[ab.field] = value + mod;
        }
      }

      /* 豁免 */
      if (/^豁免/.test(line)) {
        otherLines.push(line);
        lineIdx++;
        continue;
      }

      /* 技能 */
      const skillMatch = line.match(/技能[：:]?\s*(.+)/);
      if (skillMatch) {
        result.skill = skillMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 伤害抗性（优先长关键词） */
      const resistMatch = line.match(/伤害抗性[：:]?\s*(.+)/);
      if (resistMatch) {
        result.resistant = resistMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 抗性（避免与伤害抗性重复） */
      if (!result.resistant) {
        const simpleResist = line.match(/(?<!伤害)抗性[：:]?\s*(.+)/);
        if (simpleResist) {
          result.resistant = simpleResist[1].trim();
          lineIdx++;
          continue;
        }
      }

      /* 伤害免疫 */
      const immuneMatch = line.match(/伤害免疫[：:]?\s*(.+)/);
      if (immuneMatch) {
        result.immune = immuneMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 状态免疫 */
      const condImmuneMatch = line.match(/状态免疫[：:]?\s*(.+)/);
      if (condImmuneMatch) {
        result.immune = result.immune ? result.immune + '；' + condImmuneMatch[1].trim() : condImmuneMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 感官 */
      const sensesMatch = line.match(/感官[：:]?\s*(.+)/);
      if (sensesMatch) {
        result.senses = sensesMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 语言 */
      const langMatch = line.match(/语言[：:]?\s*(.+)/);
      if (langMatch) {
        result.languages = langMatch[1].trim();
        lineIdx++;
        continue;
      }

      /* 挑战等级 */
      const crMatch = line.match(/(?:挑战等级|CR)[：:]?\s*(.+)/i);
      if (crMatch) {
        result.cr = crMatch[1].trim();
        foundCR = true;
        lineIdx++;
        continue;
      }

      /* 如果在特质/动作段落中，尝试解析为条目 */
      if (currentSection) {
        // 尝试用中文句号拆分标题和描述
        const cnPeriodMatch = line.match(/^(.+?)。\s*(.+)$/);
        // 如果没有中文句号，尝试英文句号后紧跟中文的情况
        const enPeriodMatch = !cnPeriodMatch ? line.match(/^(.+?[a-zA-Z])\.\s*([\u4e00-\u9fff].+)$/) : null;
        
        if (cnPeriodMatch || enPeriodMatch) {
          const match = cnPeriodMatch || enPeriodMatch;
          finalizePending();
          pendingEntry = { title: match[1].trim(), desc: match[2].trim() };
        } else if (pendingEntry) {
          // 续行：追加到当前条目的描述
          pendingEntry.desc += '\n' + line;
        } else {
          // 无法拆分的行，整体作为描述
          pendingEntry = { title: '', desc: line };
        }
        lineIdx++;
        continue;
      }

      /* CR 之后且无显式标题时，默认当作特质处理 */
      if (foundCR && !currentSection) {
        const cnPeriodMatch = line.match(/^(.+?)。\s*(.+)$/);
        const enPeriodMatch = !cnPeriodMatch ? line.match(/^(.+?[a-zA-Z])\.\s*([\u4e00-\u9fff].+)$/) : null;
        
        if (cnPeriodMatch || enPeriodMatch) {
          const match = cnPeriodMatch || enPeriodMatch;
          result.traits.push({ title: match[1].trim(), desc: match[2].trim() });
        } else {
          otherLines.push(line);
        }
        lineIdx++;
        continue;
      }

      /* 无法识别的行，放入 other */
      otherLines.push(line);
      lineIdx++;
    }

    // 收尾：将最后一个 pending 条目加入结果
    finalizePending();

    result.other = otherLines.join('\n');
    return result;
  },

  /* 辅助：解析特质或动作条目（格式："名称。描述" 或 "名称.中文描述"） */
  _parseTraitOrAction(line, section, result) {
    // 优先用中文句号拆分
    const cnMatch = line.match(/^(.+?)。\s*(.+)$/);
    // 其次用英文句号后紧跟中文的情况
    const enMatch = !cnMatch ? line.match(/^(.+?[a-zA-Z])\.\s*([\u4e00-\u9fff].+)$/) : null;
    
    const match = cnMatch || enMatch;
    const entry = match
      ? { title: match[1].trim(), desc: match[2].trim() }
      : { title: '', desc: line.trim() };
    
    if (section === 'traits') {
      result.traits.push(entry);
    } else if (section === 'actions') {
      result.actions.push(entry);
    }
  },

  /* ========== 盲盒文本解析 ========== */

  /**
   * 解析盲盒/随机遭遇文本为结构化骰点范围数据
   * 支持格式：魔法泉效果（逐行编号）、鬼怪帮持有物（范围+内容）、下水道遭遇（范围+内容）
   * 返回 { name, dieType: 'd20', headers: ['效果'], ranges: [{min,max,content}] }
   */
  parseBlindboxText(text) {
    const result = {
      name: '',
      dieType: 'd20',
      headers: [],
      ranges: []
    };

    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^[-—–]+$/.test(l));
    if (lines.length === 0) return result;

    // 第1行作为标题
    result.name = lines[0].substring(0, 60);
    let lineIdx = 1;

    // 扫描找到骰子类型行（如 "D10"、"d20"、"d20 物品" 等）
    let dieTypeFound = false;
    while (lineIdx < lines.length) {
      const line = lines[lineIdx];
      const dieMatch = line.match(/\b([dD])(\d+)\b/i);
      if (dieMatch) {
        result.dieType = 'd' + dieMatch[2];
        dieTypeFound = true;
        lineIdx++;
        break;
      }
      lineIdx++;
    }

    // 骰子行下方如有非范围行 → 列标题
    if (lineIdx < lines.length) {
      const headerLine = lines[lineIdx];
      // 检查是否是范围行（以数字开头，包含 ~～ 或纯数字后跟文字）
      const isRangeLine = /^\d+\s*[~～]/.test(headerLine) || /^\d+\s+[^\d]/.test(headerLine);
      if (!isRangeLine && !/^\d+$/.test(headerLine)) {
        // 不是范围行，当作列标题
        result.headers = [headerLine.replace(/^\d+\s*/, '').trim()];
        lineIdx++;
      }
    }

    // 解析后续的范围行（支持多行内容归属）
    while (lineIdx < lines.length) {
      const line = lines[lineIdx];

      // 匹配范围格式："1~10 内容" 或 "1～10 内容"
      const rangeMatch = line.match(/^(\d+)\s*[~～]\s*(\d+)\s+(.+)$/);
      // 匹配单号格式："1 内容"（数字+空格+非数字内容）
      const singleMatch = !rangeMatch ? line.match(/^(\d+)\s+(.+)$/) : null;
      // 匹配纯数字行（如单独一行的 "2"）
      const pureNumMatch = !rangeMatch && !singleMatch ? line.match(/^(\d+)$/) : null;

      if (rangeMatch) {
        // 范围格式始终是新条目起始
        result.ranges.push({
          min: parseInt(rangeMatch[1]),
          max: parseInt(rangeMatch[2]),
          content: rangeMatch[3].trim()
        });
      } else if (pureNumMatch) {
        // 纯数字行：新条目起始（内容在后续行中）
        const num = parseInt(pureNumMatch[1]);
        result.ranges.push({ min: num, max: num, content: '' });
      } else if (singleMatch) {
        const num = parseInt(singleMatch[1]);
        const afterNum = singleMatch[2].trim();
        // 判断是新条目起始还是上一个条目的内容续行
        const endsWithSentencePunct = /[。！？；]$/.test(line);
        const looksLikeLabel = !endsWithSentencePunct && /^\D/.test(afterNum);

        if (looksLikeLabel && result.ranges.length > 0) {
          // 不以句子标点结尾，且内容以非数字开头 → 像条目标题 → 追加到上一个条目内容
          const last = result.ranges[result.ranges.length - 1];
          last.content = (last.content ? last.content + '\n' : '') + line;
        } else if (looksLikeLabel) {
          // 没有上一个条目，作为新条目
          result.ranges.push({ min: num, max: num, content: afterNum });
        } else if (result.ranges.length > 0) {
          // 以句子标点结尾，或内容以数字开头 → 是描述内容 → 追加到上一个条目
          const last = result.ranges[result.ranges.length - 1];
          last.content = (last.content ? last.content + '\n' : '') + line;
        } else {
          // 以句子标点结尾，且没有上一个条目 → 作为新条目（首条内容恰好是完整句子）
          result.ranges.push({ min: num, max: num, content: afterNum });
        }
      } else {
        // 不匹配任何条目模式 → 追加到上一个条目的内容
        if (result.ranges.length > 0) {
          const last = result.ranges[result.ranges.length - 1];
          last.content = (last.content ? last.content + '\n' : '') + line;
        }
      }

      lineIdx++;
    }

    // 如果没有解析到任何范围，尝试从原始文本推断
    if (result.ranges.length === 0 && lines.length > 2) {
      // 假设从第3行开始每行是一个结果，按顺序编号
      const startIdx = dieTypeFound ? 2 : 1;
      for (let i = startIdx; i < lines.length; i++) {
        result.ranges.push({
          min: i - startIdx + 1,
          max: i - startIdx + 1,
          content: lines[i]
        });
      }
      // 根据最大编号推断骰子类型
      const maxNum = result.ranges.length;
      if (maxNum <= 4) result.dieType = 'd4';
      else if (maxNum <= 6) result.dieType = 'd6';
      else if (maxNum <= 8) result.dieType = 'd8';
      else if (maxNum <= 10) result.dieType = 'd10';
      else if (maxNum <= 12) result.dieType = 'd12';
      else if (maxNum <= 20) result.dieType = 'd20';
      else result.dieType = 'd100';
    }

    return result;
  },

  /* 将选中文本入库 */
  addToDatabase(dbKey) {
    // 先恢复之前保存的选区
    if (this._savedRange && this._editor && this._editor.initialized) {
      const ed = this._editor;
      ed.selection.setRng(this._savedRange);
    }
    let text = '';
    if (this._editor && this._editor.initialized) {
      text = this._editor.selection.getContent({ format: 'text' }).trim();
    }
    if (!text) {
      this.showToast('请先选中要入库的文本', 'info');
      return;
    }

    if (!AppState.currentModule) return;

    const cfg = DatabaseManager.getMergedDbConfig()[dbKey];
    const dbName = cfg ? cfg.name : dbKey;

    const entry = {
      id: AppState.generateUUID(),
      content: text,
      source: 'manual',
      createdAt: new Date().toISOString()
    };

    /* 角色/怪物：自动解析文本为结构化数据 */
    if (dbKey === 'characters') {
      if (SystemManager.getCurrentSystem() !== 'dnd5r') {
        entry.name = text.split('\n')[0].substring(0, 30);
        entry.fields = {
          _name: entry.name,
          _faction: 'friendly_npc',
          _hp: '',
          _props: {},
          _sections: {}
        };
      } else {
        const parsed = this.parseCharacterText(text);
        entry.name = parsed.name || text.split('\n')[0].substring(0, 30);
        entry.fields = {
          '名称': parsed.name,
          '英文名称': parsed.enName,
          '体型': parsed.size,
          '类型': parsed.type,
          '阵营': parsed.alignment,
          'AC': parsed.ac,
          '先攻': parsed.initiative,
          'HP': parsed.hp,
          '速度': parsed.speed,
          '力量': parsed.str,
          '敏捷': parsed.dex,
          '体质': parsed.con,
          '智力': parsed.int,
          '感知': parsed.wis,
          '魅力': parsed.cha,
          '技能': parsed.skill,
          '免疫': parsed.immune,
          '抗性': parsed.resistant,
          '感官': parsed.senses,
          '语言': parsed.languages,
          'CR': parsed.cr,
          '_traits': JSON.stringify(parsed.traits),
          '_actions': JSON.stringify(parsed.actions),
          '_other': parsed.other
        };
      }
    }

    /* 盲盒：自动解析文本为骰点范围数据 */
    if (dbKey === 'blindbox') {
      const parsed = this.parseBlindboxText(text);
      entry.name = parsed.name || text.split('\n')[0].substring(0, 30);
      entry.diceRanges = {
        dieType: parsed.dieType,
        headers: parsed.headers,
        ranges: parsed.ranges
      };
    }

    /* 推入对应数据库 */
    const group = DatabaseManager._currentDbGroup || '1号库';
    const mod = AppState.currentModule;
    if (mod.databases && mod.databases[group] && mod.databases[group][dbKey]) {
      mod.databases[group][dbKey].push(entry);
    } else {
      this.showToast('数据库不存在', 'error');
      return;
    }

    /* 记录来源位置并用 source-marker 包裹原文 */
    if (this._savedRange && this.editorEl.contains(this._savedRange.commonAncestorContainer)) {
      // 构建标题路径（headingPath）
      const headingPath = [];
      let node = this._savedRange.startContainer;
      while (node && node !== this.editorEl) {
        if (node.nodeType === 1 && /^H[1-3]$/i.test(node.tagName)) {
          headingPath.unshift({ tag: node.tagName.toLowerCase(), text: node.textContent.trim() });
        }
        node = node.parentNode;
      }
      entry.sourceLocation = {
        headingPath: headingPath,
        textSnippet: text.substring(0, 80)
      };

      // 用 source-marker span 包裹选中的文本
      try {
        const marker = document.createElement('span');
        marker.className = 'source-marker';
        marker.dataset.sourceEntryId = entry.id;
        this._savedRange.surroundContents(marker);
        // 直接同步编辑器 DOM 到模块数据（绕过 isDirty 检查，确保 marker 被持久化）
        if (AppState.currentModule) {
          AppState.currentModule.document.htmlContent = this.editorEl.innerHTML;
          AppState.currentModule.document.rawText = this.editorEl.innerText || '';
        }
      } catch (e) {
        // 跨元素选区等复杂情况可能失败，静默忽略
      }
    }

    /* 立即保存（不走防抖，确保分屏右边刷新前数据已落盘） */
    (async () => {
      await StorageManager.saveNow();

      /* 分屏模式：保存确认完成后，通知带团板 */
      try {
        if (typeof SharedBridge !== 'undefined' && SharedBridge.isInIframe()) {
          SharedBridge.send('ENTRY_ADDED', {
            dbKey: dbKey,
            entryId: entry.id,
            entry: entry
          });
        }
      } catch(e) { /* ignore */ }
    })();

    /* 显示提示 */
    this.showToast(`已添加到${dbName}`, 'success');

    /* 如果数据库面板当前打开，自动刷新对应数据库的条目列表 */
    const panel = document.getElementById('dbPanel');
    if (panel && panel.classList.contains('open')) {
      DatabaseManager.renderDbList();
      if (DatabaseManager._currentDbKey === dbKey) {
        DatabaseManager.renderEntries(dbKey);
      }
    }

    if (typeof Tutorial !== 'undefined') {
      let roleType = '';
      if (dbKey === 'characters') {
        if (text.includes('石头') || text.includes('矮人')) {
          roleType = 'pl';
        } else if (text.includes('哥布林') || text.includes('敌对')) {
          roleType = 'enemy';
        }
      }
      Tutorial.emit('noteAddedToDatabase', { dbKey, roleType });
    }
  },

  /* ========== 目录树 ========== */

  toggleToc() {
    const toc = document.getElementById('editorToc');
    this.tocCollapsed = !this.tocCollapsed;
    if (toc) {
      toc.classList.toggle('collapsed', this.tocCollapsed);
    }
  },

  /* 渲染目录树 */
  renderTocTree() {
    const tocList = document.getElementById('tocList');
    if (!tocList || !this.editorEl) return;

    /* 优先使用 PDF 书签目录 */
    const bookmarks = AppState.currentModule && AppState.currentModule.document && AppState.currentModule.document.bookmarks;
    if (bookmarks && bookmarks.length > 0) {
      let html = '';
      for (const bm of bookmarks) {
        const indent = (bm.level - 1) * 16;
        html += `<div class="toc-item level-${bm.level}" 
                      style="padding-left:${12 + indent}px" 
                      data-title="${this.escapeHtml(bm.title)}"
                      onclick="DocEditor.scrollToHeadingById('${this.escapeHtml(bm.title).replace(/'/g, "\\'")}')">
          ${this.escapeHtml(bm.title)}
        </div>`;
      }
      tocList.innerHTML = html;
      return;
    }

    /* 回退：从编辑器 DOM 中提取标题 */
    const headings = this.editorEl.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
      tocList.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted);">暂无标题</div>';
      return;
    }

    let html = '';
    headings.forEach((h, index) => {
      const level = parseInt(h.tagName[1]);
      const indent = (level - 1) * 16;
      const id = h.id || `toc-heading-${index}`;
      if (!h.id) h.id = id;
      const text = h.textContent.trim().substring(0, 50);
      html += `<div class="toc-item level-${level}" 
                    style="padding-left:${12 + indent}px" 
                    onclick="DocEditor.scrollToHeadingById('${id}')">
        ${this.escapeHtml(text)}
      </div>`;
    });

    tocList.innerHTML = html;
  },

  /* 通过 id 或标题文本滚动到指定标题 */
  scrollToHeadingById(idOrTitle) {
    const editorEl = document.getElementById('editorContent');
    if (!editorEl) return;

    /* 先尝试按 id 查找 */
    let target = document.getElementById(idOrTitle);

    /* 如果没找到，按标题文本搜索 */
    if (!target) {
      const headings = editorEl.querySelectorAll('h1, h2, h3');
      for (const h of headings) {
        if (h.textContent.trim().includes(idOrTitle)) {
          target = h;
          break;
        }
      }
    }

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      /* 高亮当前目录条目 */
      const tocEntries = document.querySelectorAll('.toc-item');
      tocEntries.forEach(entry => entry.classList.remove('active'));

      /* 找到对应的目录条目 */
      const title = target.textContent.trim().substring(0, 50);
      for (const entry of tocEntries) {
        if (entry.textContent.trim() === title ||
            entry.getAttribute('data-title') === idOrTitle) {
          entry.classList.add('active');
          break;
        }
      }
    }
  },

  /* 根据滚动位置更新目录树高亮 */
  updateTocHighlight() {
    const wrap = document.getElementById('editorContentWrap');
    if (!wrap || !this.editorEl) return;

    const headings = this.editorEl.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) return;

    const scrollTop = wrap.scrollTop;
    let activeId = null;

    headings.forEach((h) => {
      const offset = h.offsetTop - wrap.offsetTop;
      if (offset <= scrollTop + 60) {
        activeId = h.id;
      }
    });

    /* 通过 id 或 data-title 匹配目录条目 */
    const activeTitle = activeId ? (document.getElementById(activeId) || {}).textContent : null;
    document.querySelectorAll('.toc-item').forEach(item => {
      const matchById = activeId && item.getAttribute('onclick') && item.getAttribute('onclick').includes(activeId);
      const matchByTitle = activeTitle && item.getAttribute('data-title') === activeTitle.trim().substring(0, 50);
      item.classList.toggle('active', matchById || matchByTitle);
    });
  },

  /* ========== 文档加载与保存 ========== */

  /* 加载文档内容到编辑器 */
  async loadDocument(module) {
    if (!this.editorEl) this.init();
    if (!this.editorEl) return;

    /* 等待编辑器就绪 */
    if (!this._editor || !this._editor.initialized) {
      this._pendingLoad = module;
      return;
    }

    const ed = this._editor;
    const DIAG = window.__diagFontSize;
    if (module.document && module.document.htmlContent) {
      if (DIAG) {
        /* 精准搜索：在上次修改的文字附近找 font-size */
        const lastText = this._diagLastModifiedText;
        const lastSize = this._diagLastModifiedSize;
        if (lastText) {
          const idx = module.document.htmlContent.indexOf(lastText);
          if (idx >= 0) {
            const start = Math.max(0, idx - 200);
            const end = Math.min(module.document.htmlContent.length, idx + lastText.length + 200);
            const snippet = module.document.htmlContent.substring(start, end).replace(/\n/g, ' ');
            const fsInSnippet = snippet.match(/font-size:\s*(\d+)px/gi);
            console.log('[DIAG-FS][loadDocument] searchText="' + lastText + '" lastDomSize=' + lastSize + 'px fontSizesNearText: ' + (fsInSnippet ? fsInSnippet.join(', ') : 'NONE'));
            console.log('[DIAG-FS][loadDocument] snippet: ' + snippet);
          } else {
            console.log('[DIAG-FS][loadDocument] text "' + lastText + '" NOT FOUND in loaded htmlContent!');
          }
        }
      }
      ed.setContent(module.document.htmlContent);
    } else if (module.document && module.document.pages && module.document.pages.length > 0) {
      const allText = module.document.pages.map(p => p.text).join('\n\n');
      const html = PDFProcessor.textToHtml(allText);
      ed.setContent(html);
      module.document.htmlContent = html;
    } else {
      ed.setContent('');
    }

    this.isDirty = false;
    this.renderTocTree();

    /* 确保编辑器可见（渐显动画） */
    const wrap = document.querySelector('.editor-content-wrap');
    if (wrap && !wrap.classList.contains('visible')) {
      void wrap.offsetWidth;
      wrap.classList.add('visible');
    }
  },

  /* 从编辑器保存文档内容 */
  saveDocument() {
    if (!this._editor || !AppState.currentModule) return;
    if (!this.isDirty) return;

    const ed = this._editor;
    const DIAG = window.__diagFontSize;
    const OLD_DIAG = window._diagSave;
    if (OLD_DIAG) {
      const snip = ed.getContent().replace(/\n/g, ' ').substring(0, 200);
      console.log('[DIAG][saveDocument] isDirty=true, content preview:', snip);
    }
    if (DIAG) {
      console.log('[DIAG-FS][saveDocument] ===== SAVING =====');
      /* 精准搜索：在上次修改的文字附近找 font-size */
      const lastText = this._diagLastModifiedText;
      const lastSize = this._diagLastModifiedSize;
      if (lastText) {
        const content = ed.getContent();
        const idx = content.indexOf(lastText);
        if (idx >= 0) {
          const start = Math.max(0, idx - 200);
          const end = Math.min(content.length, idx + lastText.length + 200);
          const snippet = content.substring(start, end).replace(/\n/g, ' ');
          const fsInSnippet = snippet.match(/font-size:\s*(\d+)px/gi);
          console.log('[DIAG-FS][saveDocument] searchText="' + lastText + '" lastDomSize=' + lastSize + 'px fontSizesNearText: ' + (fsInSnippet ? fsInSnippet.join(', ') : 'NONE'));
          console.log('[DIAG-FS][saveDocument] snippet: ' + snippet);
        } else {
          console.log('[DIAG-FS][saveDocument] text "' + lastText + '" NOT FOUND in getContent!');
        }
      }
    }
    AppState.currentModule.document.htmlContent = ed.getContent();
    AppState.currentModule.document.rawText = ed.getContent({ format: 'text' });
    AppState.currentModule.updatedAt = new Date().toISOString();
    this.isDirty = false;

    StorageManager.scheduleSave();

    /* 保存完成后重置工具栏状态 */
    this.updateToolbarState();
  },

  /* ========== Toast 提示 ========== */

  showToast(message, type) {
    type = type || 'info';
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const iconMap = {
      success: '#i-check',
      error: '#i-alert',
      info: '#i-info'
    };

    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<span class="icon"><svg><use href="${iconMap[type] || iconMap.info}"/></svg></span><span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    /* 2.5秒后移除 */
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 2500);
  },

  /* HTML 转义 */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

/* ==========================================================================
 * 数据库管理模块
 * 负责数据库侧边栏、条目列表、编辑弹窗的渲染与交互
 * ========================================================================== */
const DatabaseManager = {
  /* 数据库配置（名称、图标、描述） */
  DB_CONFIG: {
    mainCG: { name: '主线CG', icon: 'i-book', desc: '必然触发的关键剧情' },
    specialCG: { name: '特殊CG', icon: 'i-star', desc: '需要特定条件触发的剧情' },
    endingCG: { name: '结局CG', icon: 'i-flag', desc: '不同结局' },
    tasks: { name: '任务/目标', icon: 'i-target', desc: '玩家任务' },
    scenes: { name: '场景', icon: 'i-map', desc: '地点和环境描述' },
    clues: { name: '线索/可互动物品', icon: 'i-search', desc: '可调查的物品和线索' },
    encounters: { name: '遭遇', icon: 'i-dice', desc: '按掷骰触发的遭遇' },
    rules: { name: '规则/机制', icon: 'i-settings', desc: '特殊规则和自定义机制' },
    traps: { name: '陷阱', icon: 'i-alert', desc: '场景陷阱' },
    characters: { name: '角色/怪物', icon: 'i-users', desc: 'NPC 和怪物的数据块' },
    items: { name: '物品', icon: 'i-box', desc: '物品/装备/魔法物品' },
    blindbox: { name: '盲盒', icon: 'i-gift', desc: '随机奖励' },
    loot: { name: '战利品', icon: 'i-trophy', desc: '战斗/探索奖励' },
    background: { name: '背景知识', icon: 'i-scroll', desc: '世界观和历史' },
    other: { name: '其他事项', icon: 'i-folder', desc: '杂项内容' }
  },

  getMergedDbConfig() {
    const mod = AppState.currentModule;
    const customTypes = mod && mod.customDbTypes ? mod.customDbTypes : {};
    const hidden = mod && Array.isArray(mod.hiddenDbTypes) ? mod.hiddenDbTypes : [];
    const merged = { ...this.DB_CONFIG, ...customTypes };
    for (const key of hidden) {
      if (this.isBuiltinType(key)) {
        delete merged[key];
      }
    }
    return merged;
  },

  isBuiltinType(dbKey) {
    return Object.prototype.hasOwnProperty.call(this.DB_CONFIG, dbKey);
  },

  _initialized: false,
  _currentDbKey: null,
  _currentDbGroup: null,
  _editingEntryId: null,
  _editingDbKey: null,
  _multiSelectMode: false,
  _selectedEntryIds: new Set(),

  /* 初始化 */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    // 渲染数据库列表
    this.renderDbList();

    // 点击弹窗遮罩关闭
    const modal = document.getElementById('dbEntryModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          this.closeEntryEditor();
        }
      });
    }

    // ESC 关闭弹窗（使用命名函数以便后续移除，但这里简化处理）
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeEntryEditor();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  /* 切换数据库侧边栏显示/隐藏 */
  togglePanel() {
    const panel = document.getElementById('dbPanel');
    const editorBody = document.getElementById('editorBody');
    if (!panel || !editorBody) return;

    const isOpen = panel.classList.contains('open');
    if (isOpen) {
      panel.classList.remove('open');
      editorBody.classList.remove('has-db-panel');
    } else {
      panel.classList.add('open');
      editorBody.classList.add('has-db-panel');
      this.init();
      // 默认选中第一个库分组
      const mod = AppState.currentModule;
      if (mod && mod.databases) {
        const groups = Object.keys(mod.databases);
        const group = groups[0] || '1号库';
        if (!this._currentDbGroup) {
          this.selectDbGroup(group);
        } else if (!this._currentDbKey) {
          const firstWithData = Object.keys(this.getMergedDbConfig()).find(k => mod.databases[this._currentDbGroup] && mod.databases[this._currentDbGroup][k] && mod.databases[this._currentDbGroup][k].length > 0);
          this.selectDb(firstWithData || 'characters');
        } else {
          this.renderEntries(this._currentDbKey);
        }
      }
    }
  },

  /* 获取当前库分组的数据 */
  _getGroupDb() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases || !this._currentDbGroup) return null;
    return mod.databases[this._currentDbGroup];
  },

  /* 渲染库分组选择器 */
  renderDbGroupSelector() {
    const selector = document.getElementById('dbGroupSelector');
    if (!selector) return;

    const mod = AppState.currentModule;
    if (!mod || !mod.databases) {
      selector.innerHTML = '';
      return;
    }

    const groups = Object.keys(mod.databases);
    const currentGroup = this._currentDbGroup || groups[0] || '1号库';

    let html = `
      <select id="dbGroupSelect" onchange="DatabaseManager.selectDbGroup(this.value)" class="db-group-select">
    `;
    for (const group of groups) {
      const selected = group === currentGroup ? 'selected' : '';
      html += `<option value="${this._escapeHtml(group)}" ${selected}>${this._escapeHtml(group)}</option>`;
    }
    html += `</select>`;
    html += `<button onclick="DatabaseManager.addDbGroup()" class="db-group-add" title="添加库"><span class="icon"><svg><use href="#i-plus"/></svg></span></button>`;
    html += `<button onclick="DatabaseManager.confirmDeleteDbGroup()" class="db-group-delete" title="删除当前库" ${groups.length <= 1 ? 'disabled' : ''}><span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span></button>`;

    selector.innerHTML = html;
  },

  /* 选择库分组 */
  selectDbGroup(group) {
    if (!group) return;

    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;

    if (!mod.databases[group]) {
      mod.databases[group] = {};
      for (const key of Object.keys(this.getMergedDbConfig())) {
        mod.databases[group][key] = [];
      }
    }

    this._currentDbGroup = group;
    this._currentDbKey = null;

    this.renderDbGroupSelector();
    this.renderDbList();

    const firstWithData = Object.keys(this.getMergedDbConfig()).find(k => mod.databases[group][k] && mod.databases[group][k].length > 0);
    this.selectDb(firstWithData || 'characters');
  },

  /* 添加新库分组 */
  addDbGroup() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;

    let newIndex = 1;
    while (mod.databases[`${newIndex}号库`]) {
      newIndex++;
    }

    const newGroup = `${newIndex}号库`;
    mod.databases[newGroup] = {};
    for (const key of Object.keys(this.getMergedDbConfig())) {
      mod.databases[newGroup][key] = [];
    }

    StorageManager.scheduleSave();
    this.selectDbGroup(newGroup);
  },

  /* 确认删除库分组 */
  confirmDeleteDbGroup() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;
    const groups = Object.keys(mod.databases);
    if (groups.length <= 1) return;
    const groupName = this._currentDbGroup || groups[0];

    let totalCount = 0;
    const groupDb = mod.databases[groupName];
    if (groupDb) {
      for (const key of Object.keys(groupDb)) {
        totalCount += (groupDb[key] || []).length;
      }
    }

    const message = totalCount > 0
      ? `确定要删除「${groupName}」吗？该库下共有 ${totalCount} 条数据，将一起被删除。此操作不可撤销。`
      : `确定要删除「${groupName}」吗？此操作不可撤销。`;

    App.showConfirm(
      '确认删除',
      message,
      '删除',
      () => { this.deleteDbGroup(groupName); }
    );
  },

  /* 删除库分组 */
  deleteDbGroup(groupName) {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;
    const groups = Object.keys(mod.databases);
    if (groups.length <= 1) return;

    delete mod.databases[groupName];

    if (this._currentDbGroup === groupName) {
      const remaining = Object.keys(mod.databases);
      this._currentDbGroup = remaining[0];
    }

    StorageManager.scheduleSave();
    this.selectDbGroup(this._currentDbGroup);
    BoardManager.renderDbGroupSelector();
    BoardManager.renderDbList();
  },

  /* 选择数据库 */
  selectDb(dbKey) {
    if (!dbKey || !this.getMergedDbConfig()[dbKey]) return;
    this._currentDbKey = dbKey;

    // 切换类型时取消多选模式
    this._multiSelectMode = false;
    this._selectedEntryIds.clear();

    // 更新多选按钮状态
    this._updateMultiSelectBtn();

    // 更新列表项高亮
    document.querySelectorAll('.db-tab-sticky').forEach(el => {
      el.classList.toggle('active', el.dataset.dbKey === dbKey);
    });

    // 清空搜索框
    const searchInput = document.getElementById('dbSearchInput');
    if (searchInput) searchInput.value = '';

    this.renderEntries(dbKey);
  },

  /* 渲染数据库列表侧边栏 */
  renderDbList() {
    const list = document.getElementById('dbList');
    if (!list) return;

    const groupDb = this._getGroupDb();
    const mergedConfig = this.getMergedDbConfig();
    let html = '';

    for (const [key, cfg] of Object.entries(mergedConfig)) {
      const entries = (groupDb && groupDb[key]) ? groupDb[key] : [];
      const totalCount = entries.length;
      const placedCount = entries.filter(e => AppState.placedEntryIds.has(e.id)).length;
      const isActive = this._currentDbKey === key ? 'active' : '';
      const isProtected = key === 'characters';
      const deleteBtn = isProtected
        ? `<span class="db-tab-delete db-tab-delete-disabled">×</span>`
        : `<span class="db-tab-delete" onclick="event.stopPropagation(); DatabaseManager.confirmDeleteCustomType('${key}')">×</span>`;
      html += `
        <div class="db-tab-sticky ${isActive}" data-db-key="${key}" onclick="DatabaseManager.selectDb('${key}')">
          <span class="icon"><svg><use href="#${cfg.icon}"/></svg></span>
          <span class="tab-name">${cfg.name}</span>
          <span class="tab-count">${placedCount}/${totalCount}</span>
          ${deleteBtn}
        </div>
      `;
    }

    html += `
      <div class="db-tab-add" onclick="DatabaseManager.showAddTypeDialog()">
        <span class="icon"><svg><use href="#i-plus"/></svg></span>
        <span>添加类型</span>
      </div>
    `;

    list.innerHTML = html;
  },

  /* 渲染当前数据库的条目 */
  renderEntries(dbKey, filterQuery) {
    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[dbKey]) return;

    const entries = groupDb[dbKey];
    const cfg = this.getMergedDbConfig()[dbKey];

    // 获取条目列表容器
    const entriesWrap = document.getElementById('dbEntriesContent');
    if (!entriesWrap) return;

    // 过滤
    let displayEntries = entries;
    if (filterQuery && filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      displayEntries = entries.filter(e => {
        const text = (e.name || e.content || '').toLowerCase();
        return text.includes(q);
      });
    }

    const multiMode = this._multiSelectMode;
    const selectedCount = this._selectedEntryIds.size;
    const allSelected = displayEntries.length > 0 && displayEntries.every(e => this._selectedEntryIds.has(e.id));

    let html = '';

    // 多选模式操作栏
    if (multiMode) {
      html += `
        <div class="db-multi-select-bar">
          <button class="multi-select-btn" onclick="DatabaseManager.toggleAllEntries()">
            ${allSelected ? '取消全选' : '全选'}
          </button>
          <span class="multi-select-count">已选 ${selectedCount} 条</span>
          <button class="multi-delete-btn" onclick="DatabaseManager.deleteSelectedEntries('${dbKey}')" ${selectedCount === 0 ? 'disabled' : ''}>
            删除选中 (${selectedCount})
          </button>
        </div>
      `;
    }

    html += `
      <div class="db-entries-header">
        <h3>
          <span class="icon"><svg><use href="#${cfg.icon}"/></svg></span>
          ${cfg.name}
        </h3>
        <span style="font-size:12px;color:var(--text-muted);">${displayEntries.length} 条</span>
      </div>
      <div class="db-entries-grid">
    `;

    if (displayEntries.length === 0) {
      html += `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">暂无条目</div>`;
    } else {
      for (const entry of displayEntries) {
        const isPlaced = AppState.placedEntryIds.has(entry.id);
        const placedClass = isPlaced ? 'placed' : '';
        const isSelected = this._selectedEntryIds.has(entry.id);
        const selectedClass = isSelected ? 'multi-selected' : '';

        // 标题：优先使用 name，否则取 content 前30字
        let title = (entry.name || '').trim();
        if (!title) {
          title = (entry.content || '').substring(0, 30).replace(/\n/g, ' ');
          if ((entry.content || '').length > 30) title += '...';
        }
        if (!title) title = '未命名条目';

        // 内容摘要
        let summary = (entry.content || '').substring(0, 100).replace(/\n/g, ' ');
        if ((entry.content || '').length > 100) summary += '...';

        // 角色/怪物类型的简化数据摘要
        let metaHtml = '';
        if (dbKey === 'characters' && entry.fields) {
          const ac = entry.fields['AC'] || entry.fields['护甲等级'] || '';
          const hp = entry.fields['HP'] || entry.fields['生命值'] || '';
          if (ac || hp) {
            metaHtml = `<div class="db-entry-meta">${ac ? 'AC ' + ac : ''}${ac && hp ? ' · ' : ''}${hp ? 'HP ' + hp : ''}</div>`;
          }
        }

        // 多选复选框
        const checkboxHtml = multiMode ? `<div class="db-entry-checkbox ${isSelected ? 'checked' : ''}">${isSelected ? '<svg><use href="#i-check"/></svg>' : ''}</div>` : '';

        // 多选模式下点击卡片切换选中，非多选模式保持原有行为
        const cardClick = multiMode
          ? `onclick="DatabaseManager.toggleEntrySelect('${entry.id}')"`
          : '';

        html += `
          <div class="db-entry-card ${placedClass} ${selectedClass}" data-entry-id="${entry.id}" ${cardClick} oncontextmenu="event.preventDefault(); DatabaseManager.openEntryEditor('${entry.id}', '${dbKey}')">
            ${checkboxHtml}
            <div class="entry-title">${this._escapeHtml(title)}</div>
            <div class="entry-summary">${this._escapeHtml(summary)}</div>
            ${metaHtml}
            ${multiMode ? '' : `
            <div class="db-entry-actions">
              <button title="编辑" onclick="event.stopPropagation(); DatabaseManager.openEntryEditor('${entry.id}', '${dbKey}')">
                <span class="icon"><svg><use href="#i-cog"/></svg></span>
              </button>
              <button title="删除" onclick="event.stopPropagation(); DatabaseManager.deleteEntry('${entry.id}', '${dbKey}')">
                <span class="icon"><svg><use href="#i-trash"/></svg></span>
              </button>
            </div>`}
          </div>
        `;
      }
    }

    html += `</div>`;
    entriesWrap.innerHTML = html;
  },

  /* 搜索过滤 */
  filterEntries(query) {
    if (!this._currentDbKey) return;
    this.renderEntries(this._currentDbKey, query);
  },

  /* ===== 多选删除功能 ===== */

  /* 切换多选模式 */
  toggleMultiSelect() {
    this._multiSelectMode = !this._multiSelectMode;
    if (!this._multiSelectMode) {
      this._selectedEntryIds.clear();
    }
    this._updateMultiSelectBtn();
    if (this._currentDbKey) {
      this.renderEntries(this._currentDbKey);
    }
  },

  /* 更新顶部栏多选按钮状态 */
  _updateMultiSelectBtn() {
    const btn = document.getElementById('dbMultiSelectBtn');
    if (!btn) return;
    if (this._multiSelectMode) {
      btn.classList.add('active');
      btn.querySelector('.btn-label').textContent = '退出多选';
    } else {
      btn.classList.remove('active');
      btn.querySelector('.btn-label').textContent = '多选';
    }
  },

  /* 切换单个条目的选中状态 */
  toggleEntrySelect(entryId) {
    if (!this._multiSelectMode) return;
    if (this._selectedEntryIds.has(entryId)) {
      this._selectedEntryIds.delete(entryId);
    } else {
      this._selectedEntryIds.add(entryId);
    }
    if (this._currentDbKey) {
      this.renderEntries(this._currentDbKey);
    }
  },

  /* 全选 / 取消全选 */
  toggleAllEntries() {
    if (!this._multiSelectMode || !this._currentDbKey) return;
    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[this._currentDbKey]) return;

    const entries = groupDb[this._currentDbKey];
    const allSelected = entries.length > 0 && entries.every(e => this._selectedEntryIds.has(e.id));

    if (allSelected) {
      this._selectedEntryIds.clear();
    } else {
      entries.forEach(e => this._selectedEntryIds.add(e.id));
    }
    this.renderEntries(this._currentDbKey);
  },

  /* 批量删除选中条目 */
  deleteSelectedEntries(dbKey) {
    if (!this._multiSelectMode) return;
    const count = this._selectedEntryIds.size;
    if (count === 0) return;

    App.showConfirm(
      '确认删除',
      `确定要删除选中的 ${count} 条条目吗？此操作不可撤销。`,
      '删除',
      () => {
        const groupDb = this._getGroupDb();
        if (!groupDb || !groupDb[dbKey]) return;

        // 反向遍历删除，避免索引偏移问题
        for (let i = groupDb[dbKey].length - 1; i >= 0; i--) {
          if (this._selectedEntryIds.has(groupDb[dbKey][i].id)) {
            AppState.placedEntryIds.delete(groupDb[dbKey][i].id);
            groupDb[dbKey].splice(i, 1);
          }
        }

        this._selectedEntryIds.clear();
        StorageManager.scheduleSave();

        // 刷新各面板
        this.renderDbList();
        this.renderEntries(dbKey);

        // 同步刷新带团板数据库面板
        if (BoardManager._dbPanelOpen && BoardManager._currentDbKey === dbKey && BoardManager._currentDbGroup === this._currentDbGroup) {
          BoardManager.renderDbEntries(dbKey);
          BoardManager.renderDbList();
        }

        DocEditor.showToast(`已删除 ${count} 条条目`, 'success');
      }
    );
  },

  /* 打开条目编辑弹窗 */
  openEntryEditor(entryId, dbKey) {
    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[dbKey]) return;

    const entry = groupDb[dbKey].find(e => e.id === entryId);
    if (!entry) return;

    this._editingEntryId = entryId;
    this._editingDbKey = dbKey;

    const modal = document.getElementById('dbEntryModal');
    const body = document.getElementById('dbEntryModalBody');
    const titleEl = document.getElementById('dbEntryModalTitle');
    if (!modal || !body) return;

    titleEl.textContent = '编辑条目';

    // 角色/怪物类型显示完整结构化表单（与画板角色编辑一致）
    let html = '';
    if (dbKey === 'characters') {
      const f = entry.fields || {};
      const esc = (v) => this._escapeHtml(v || '');

      if (SystemManager.getCurrentSystem() !== 'dnd5r') {
        const tpl = CharTemplateManager.getTemplate();
        const props = f._props || {};
        const sections = f._sections || {};

        const name = f._name || entry.name || '';
        const faction = f._faction || 'friendly_npc';
        const hp = f._hp || '';

        html += `<div class="form-group"><label>名称</label>`;
        html += `<input type="text" id="dbEditName" value="${esc(name)}" placeholder="角色名称">`;
        html += `</div>`;

        html += `<div class="form-group"><label>阵营 / HP</label>`;
        html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
        html += `<select id="dbCharFaction">
          <option value="pc" ${faction === 'pc' ? 'selected' : ''}>玩家角色</option>
          <option value="friendly_npc" ${faction === 'friendly_npc' ? 'selected' : ''}>友方NPC</option>
          <option value="enemy_npc" ${faction === 'enemy_npc' ? 'selected' : ''}>敌方NPC</option>
        </select>`;
        html += `<input type="text" id="dbCharHp" value="${esc(hp)}" placeholder="HP 值">`;
        html += `</div></div>`;

        if (tpl.properties.length > 0) {
          html += `<div class="form-group"><label>属性</label>`;
          html += `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(80px, 1fr));gap:6px;">`;
          tpl.properties.forEach(prop => {
            const val = props[prop.id] || '';
            html += `<div><label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;text-align:center;">${esc(prop.name)}</label>`;
            html += `<input type="text" class="db-prop-input" data-prop="${prop.id}" value="${esc(val)}" style="text-align:center;width:100%;"></div>`;
          });
          html += `</div></div>`;
        }

        tpl.sections.forEach(sec => {
          const items = sections[sec.id] || [];
          html += `<div class="form-group"><label>
            <span class="icon" style="margin-right:4px;"><svg width="12" height="12"><use href="#${sec.icon}"/></svg></span>
            ${esc(sec.name)}
          </label>`;
          html += `<div class="db-char-section-list" data-section="${sec.id}">`;
          items.forEach((it, i) => {
            html += `<div class="char-section-row" data-idx="${i}" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px;">`;
            html += `<input type="text" class="section-name" value="${esc(it.name)}" placeholder="名称" style="width:100%;">`;
            html += `<textarea class="section-desc" placeholder="描述" rows="2" style="width:100%;">${esc(it.desc)}</textarea>`;
            html += `<div style="text-align:right;"><button onclick="this.closest('.char-section-row').remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 6px;">删除</button></div>`;
            html += `</div>`;
          });
          html += `</div>`;
          html += `<button onclick="DatabaseManager._addDbCustomSectionRow('${sec.id}')" type="button" style="padding:4px 10px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;">+ 添加</button>`;
          html += `</div>`;
        });

        html += `<div class="form-group"><label>内容描述</label>`;
        html += `<textarea id="dbEditContent" rows="4">${this._escapeHtml(entry.content || '')}</textarea>`;
        html += `</div>`;
      } else {

      // 基础信息
      html += `<div class="form-group"><label>名称</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
      html += `<input type="text" id="dbEditName" value="${esc(entry.name)}" placeholder="中文名称">`;
      html += `<input type="text" id="dbCharEnName" value="${esc(f['英文名称'])}" placeholder="英文名称">`;
      html += `</div></div>`;

      html += `<div class="form-group"><label>体型 / 类型 / 阵营</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">`;
      html += `<input type="text" id="dbCharSize" value="${esc(f['体型'])}" placeholder="大型">`;
      html += `<input type="text" id="dbCharType" value="${esc(f['类型'])}" placeholder="异怪">`;
      html += `<input type="text" id="dbCharAlignment" value="${esc(f['阵营'])}" placeholder="混乱邪恶">`;
      html += `</div></div>`;

      // 战斗数据
      html += `<div class="form-group"><label>战斗数据</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">AC</label><input type="text" id="dbCharAC" value="${esc(f['AC'] || f['护甲等级'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">先攻</label><input type="text" id="dbCharInitiative" value="${esc(f['先攻'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">HP</label><input type="text" id="dbCharHP" value="${esc(f['HP'] || f['生命值'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">速度</label><input type="text" id="dbCharSpeed" value="${esc(f['速度'])}"></div>`;
      html += `</div></div>`;

      // 六项属性
      html += `<div class="form-group"><label>六项属性</label>`;
      html += `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;">`;
      const abLabels = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
      for (const [key, label] of Object.entries(abLabels)) {
        html += `<div><label style="font-size:10px;color:var(--text-muted);display:block;text-align:center;">${label}</label>`;
        html += `<input type="text" id="dbChar${key.toUpperCase()}" value="${esc(f[label])}" style="text-align:center;"></div>`;
      }
      html += `</div></div>`;

      // 其他属性
      html += `<div class="form-group"><label>其他属性</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">技能</label><input type="text" id="dbCharSkill" value="${esc(f['技能'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">免疫</label><input type="text" id="dbCharImmune" value="${esc(f['免疫'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">抗性</label><input type="text" id="dbCharResistant" value="${esc(f['抗性'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">感官</label><input type="text" id="dbCharSenses" value="${esc(f['感官'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">语言</label><input type="text" id="dbCharLanguages" value="${esc(f['语言'])}"></div>`;
      html += `<div><label style="font-size:11px;color:var(--text-muted);">CR</label><input type="text" id="dbCharCR" value="${esc(f['CR'] || f['挑战等级'])}"></div>`;
      html += `</div></div>`;

      // 特质（动态列表）
      let traits = [];
      try { traits = JSON.parse(f['_traits'] || '[]'); } catch(e) {}
      html += `<div class="form-group"><label>特质</label>`;
      html += `<div id="dbCharTraitsList">`;
      traits.forEach((t, i) => {
        html += `<div class="char-trait-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        html += `<input type="text" class="trait-title" value="${esc(t.title)}" placeholder="标题" style="flex:1;">`;
        html += `<input type="text" class="trait-desc" value="${esc(t.desc)}" placeholder="描述" style="flex:2;">`;
        html += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button onclick="DatabaseManager._addDbCharTraitRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加特质</button>`;
      html += `</div>`;

      // 动作（动态列表）
      let actions = [];
      try { actions = JSON.parse(f['_actions'] || '[]'); } catch(e) {}
      html += `<div class="form-group"><label>动作</label>`;
      html += `<div id="dbCharActionsList">`;
      actions.forEach((a, i) => {
        html += `<div class="char-action-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        html += `<input type="text" class="action-title" value="${esc(a.title)}" placeholder="标题" style="flex:1;">`;
        html += `<input type="text" class="action-desc" value="${esc(a.desc)}" placeholder="描述" style="flex:2;">`;
        html += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button onclick="DatabaseManager._addDbCharActionRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加动作</button>`;
      html += `</div>`;

      // 物品（动态列表）
      let items = [];
      try { items = JSON.parse(f['_items'] || '[]'); } catch(e) {}
      html += `<div class="form-group"><label>物品</label>`;
      html += `<div id="dbCharItemsList">`;
      items.forEach((it, i) => {
        html += `<div class="char-item-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        html += `<input type="text" class="item-name" value="${esc(it.name)}" placeholder="物品名称" style="flex:1;">`;
        html += `<input type="text" class="item-count" value="${esc(it.count || '1')}" placeholder="数量" style="width:60px;text-align:center;">`;
        html += `<input type="text" class="item-desc" value="${esc(it.desc)}" placeholder="描述" style="flex:2;">`;
        html += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button onclick="DatabaseManager._addDbCharItemRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加物品</button>`;
      html += `<button onclick="DatabaseManager._addDbCharItemFromRulebook()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--accent);border-radius:4px;background:none;color:var(--accent);cursor:pointer;margin-bottom:8px;">+ 从规则书添加</button>`;
      html += `</div>`;

      // 法术（动态列表）
      let spells = [];
      try { spells = JSON.parse(f['_spells'] || '[]'); } catch(e) {}
      html += `<div class="form-group"><label>法术</label>`;
      html += `<div id="dbCharSpellsList">`;
      spells.forEach((sp, i) => {
        html += `<div class="char-spell-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        html += `<input type="text" class="spell-name" value="${esc(sp.name)}" placeholder="法术名称" style="flex:1;">`;
        html += `<input type="text" class="spell-level" value="${esc(sp.level || '0')}" placeholder="环位(0-9)" style="width:50px;text-align:center;">`;
        html += `<input type="text" class="spell-desc" value="${esc(sp.desc)}" placeholder="描述" style="flex:2;">`;
        html += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button onclick="DatabaseManager._addDbCharSpellRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加法术</button>`;
      html += `<button onclick="DatabaseManager._addDbCharSpellFromRulebook()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--accent);border-radius:4px;background:none;color:var(--accent);cursor:pointer;margin-bottom:8px;">+ 从规则书添加</button>`;
      html += `</div>`;

      // 其他
      html += `<div class="form-group"><label>其他</label>`;
      html += `<textarea id="dbCharOther" style="height:80px;" placeholder="其他内容...">${esc(f['_other'])}</textarea>`;
      html += `</div>`;

      // 原始文本（折叠）
      html += `<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">原始文本</summary>`;
      html += `<textarea style="height:100px;margin-top:4px;font-size:11px;" readonly>${esc(entry.content)}</textarea>`;
      html += `</details>`;
      }
    } else if (dbKey === 'items') {
      const f = entry.fields || {};
      const esc = (v) => this._escapeHtml(v || '');
      
      html += `<div class="form-group"><label>物品名称</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
      html += `<input type="text" id="dbEditName" value="${esc(entry.name)}" placeholder="物品名称">`;
      html += `<input type="text" id="dbItemEnName" value="${esc(f['英文名称'])}" placeholder="英文名称">`;
      html += `</div></div>`;
      
      html += `<div class="form-group"><label>类型 / 稀有度 / 价格</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">`;
      html += `<input type="text" id="dbItemType" value="${esc(f['类型'])}" placeholder="武器/护甲/道具">`;
      html += `<input type="text" id="dbItemRarity" value="${esc(f['稀有度'])}" placeholder="普通/稀有/史诗">`;
      html += `<input type="text" id="dbItemPrice" value="${esc(f['价格'])}" placeholder="价格">`;
      html += `</div></div>`;
      
      html += `<div class="form-group"><label>重量 / 数量</label>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">`;
      html += `<input type="text" id="dbItemWeight" value="${esc(f['重量'])}" placeholder="重量">`;
      html += `<input type="text" id="dbItemCount" value="${esc(f['数量'] || '1')}" placeholder="数量">`;
      html += `</div></div>`;
      
      html += `<div class="form-group"><label>物品描述</label>`;
      html += `<textarea id="dbItemDesc" style="height:100px;">${esc(entry.content || f['描述'] || '')}</textarea>`;
      html += `</div>`;
      
      html += `<div class="form-group"><label>属性/效果</label>`;
      html += `<textarea id="dbItemProperties" style="height:80px;">${esc(f['属性'] || f['效果'] || '')}</textarea>`;
      html += `</div>`;
      
      if (SystemManager.getCurrentSystem() === 'dnd5r') {
        html += `<button onclick="DatabaseManager._addItemFromRulebook()" type="button" style="padding:6px 12px;font-size:12px;border:1px dashed var(--accent);border-radius:6px;background:none;color:var(--accent);cursor:pointer;margin-top:8px;">从规则书选择物品</button>`;
      }
      
      html += `<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">原始数据</summary>`;
      html += `<textarea style="height:80px;margin-top:4px;font-size:11px;" readonly>${esc(JSON.stringify(entry, null, 2))}</textarea>`;
      html += `</details>`;
    } else if (dbKey === 'blindbox') {
      // 盲盒：结构化骰点范围表单
      const dr = entry.diceRanges || { dieType: 'd20', headers: [], ranges: [] };
      // 兼容旧格式（数组）
      const dieType = dr.dieType || 'd20';
      const headers = dr.headers || [];
      const ranges = dr.ranges || (Array.isArray(dr) ? dr : []);
      const esc = (v) => this._escapeHtml(v || '');

      html += `<div class="form-group"><label>标题</label>`;
      html += `<input type="text" id="dbEditName" value="${esc(entry.name)}"></div>`;

      html += `<div class="form-group"><label>骰子类型</label>`;
      html += `<input type="text" id="dbBxDieType" value="${esc(dieType)}" placeholder="如 d20" style="width:120px;"></div>`;

      html += `<div class="form-group"><label>列标题（可选）</label>`;
      html += `<input type="text" id="dbBxHeaders" value="${esc(headers.join('、'))}" placeholder="如：效果、物品、遭遇"></div>`;

      html += `<div class="form-group"><label>骰点范围</label>`;
      html += `<div id="dbBxRangesList">`;
      ranges.forEach((r, i) => {
        html += `<div class="bx-range-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">`;
        html += `<input type="text" class="bx-range-min" value="${esc(String(r.min))}" placeholder="最小" style="width:50px;text-align:center;">`;
        html += `<span style="color:var(--text-muted);">~</span>`;
        html += `<input type="text" class="bx-range-max" value="${esc(String(r.max))}" placeholder="最大" style="width:50px;text-align:center;">`;
        html += `<input type="text" class="bx-range-content" value="${esc(r.content)}" placeholder="内容" style="flex:1;">`;
        html += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        html += `</div>`;
      });
      html += `</div>`;
      html += `<button onclick="DatabaseManager._addBxRangeRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-top:4px;">+ 添加范围</button>`;
      html += `</div>`;

      html += `<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted);">原始文本</summary>`;
      html += `<textarea style="height:100px;margin-top:4px;font-size:11px;" readonly>${esc(entry.content)}</textarea>`;
      html += `</details>`;
    } else {
      html += `
        <div class="form-group">
          <label>标题</label>
          <input type="text" id="dbEditName" value="${this._escapeHtml(entry.name || '')}">
        </div>
        <div class="form-group">
          <label>内容</label>
          <textarea id="dbEditContent">${this._escapeHtml(entry.content || '')}</textarea>
        </div>
      `;
    }

    body.innerHTML = html;
    modal.classList.add('active');
  },

  /* 数据库角色编辑：添加特质行 */
  _addDbCharTraitRow(title, desc) {
    const list = document.getElementById('dbCharTraitsList');
    if (!list) return;
    const idx = list.children.length;
    const div = document.createElement('div');
    div.className = 'char-trait-row';
    div.dataset.idx = idx;
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="trait-title" value="${this._escapeHtml(title || '')}" placeholder="标题" style="flex:1;">
      <input type="text" class="trait-desc" value="${this._escapeHtml(desc || '')}" placeholder="描述" style="flex:2;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  _addDbCustomSectionRow(secId) {
    const list = document.querySelector(`.db-char-section-list[data-section="${secId}"]`);
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'char-section-row';
    div.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px;';
    div.innerHTML = `
      <input type="text" class="section-name" value="" placeholder="名称" style="width:100%;">
      <textarea class="section-desc" placeholder="描述" rows="2" style="width:100%;"></textarea>
      <div style="text-align:right;"><button onclick="this.closest('.char-section-row').remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 6px;">删除</button></div>
    `;
    list.appendChild(div);
  },

  /* 数据库角色编辑：添加动作行 */
  _addDbCharActionRow(title, desc) {
    const list = document.getElementById('dbCharActionsList');
    if (!list) return;
    const idx = list.children.length;
    const div = document.createElement('div');
    div.className = 'char-action-row';
    div.dataset.idx = idx;
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="action-title" value="${this._escapeHtml(title || '')}" placeholder="标题" style="flex:1;">
      <input type="text" class="action-desc" value="${this._escapeHtml(desc || '')}" placeholder="描述" style="flex:2;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  /* 数据库角色编辑：添加物品行 */
  _addDbCharItemRow(name, count, desc) {
    const list = document.getElementById('dbCharItemsList');
    if (!list) return;
    const idx = list.children.length;
    const div = document.createElement('div');
    div.className = 'char-item-row';
    div.dataset.idx = idx;
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="item-name" value="${this._escapeHtml(name || '')}" placeholder="物品名称" style="flex:1;">
      <input type="text" class="item-count" value="${this._escapeHtml(String(count || '1'))}" placeholder="数量" style="width:60px;text-align:center;">
      <input type="text" class="item-desc" value="${this._escapeHtml(desc || '')}" placeholder="描述" style="flex:2;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  /* 数据库角色编辑：从规则书添加物品 */
  _addDbCharItemFromRulebook() {
    const items = RulebookManager.data.items || [];
    const magicItems = RulebookManager.data.magicItems || [];
    const weapons = RulebookManager.data.weapons || [];
    const armor = RulebookManager.data.armor || [];
    
    const allItems = [...items, ...magicItems, ...weapons, ...armor];
    if (allItems.length === 0) {
      alert('规则书中暂无物品数据');
      return;
    }
    
    const names = allItems.map(i => i.name).join('\n');
    const selectedName = prompt('请输入要添加的物品名称：\n\n可选物品：\n' + names);
    if (!selectedName) return;
    
    const found = allItems.find(i => i.name === selectedName.trim());
    if (found) {
      this._addDbCharItemRow(found.name, 1, found.description || '');
    } else {
      alert('未找到该物品');
    }
  },

  /* 数据库角色编辑：添加法术行 */
  _addDbCharSpellRow(name, level, desc) {
    const list = document.getElementById('dbCharSpellsList');
    if (!list) return;
    const idx = list.children.length;
    const div = document.createElement('div');
    div.className = 'char-spell-row';
    div.dataset.idx = idx;
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `
      <input type="text" class="spell-name" value="${this._escapeHtml(name || '')}" placeholder="法术名称" style="flex:1;">
      <input type="text" class="spell-level" value="${this._escapeHtml(String(level || '0'))}" placeholder="环位" style="width:50px;text-align:center;">
      <input type="text" class="spell-desc" value="${this._escapeHtml(desc || '')}" placeholder="描述" style="flex:2;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  /* 数据库角色编辑：从规则书添加法术 */
  _addDbCharSpellFromRulebook() {
    const spells = RulebookManager.data.spells || [];
    if (spells.length === 0) {
      alert('规则书中暂无法术数据');
      return;
    }
    
    const names = spells.map(s => `${s.name} (${s.level}环)`).join('\n');
    const selected = prompt('请输入要添加的法术名称：\n\n可选法术：\n' + names);
    if (!selected) return;
    
    const found = spells.find(s => s.name === selected.trim());
    if (found) {
      this._addDbCharSpellRow(found.name, found.level, found.description || '');
    } else {
      alert('未找到该法术');
    }
  },

  /* 数据库物品编辑：从规则书选择物品 */
  _addItemFromRulebook() {
    const items = RulebookManager.data.items || [];
    const magicItems = RulebookManager.data.magicItems || [];
    const weapons = RulebookManager.data.weapons || [];
    const armor = RulebookManager.data.armor || [];
    
    const allItems = [...items, ...magicItems, ...weapons, ...armor];
    if (allItems.length === 0) {
      alert('规则书中暂无物品数据');
      return;
    }
    
    const names = allItems.map(i => i.name).join('\n');
    const selectedName = prompt('请输入要选择的物品名称：\n\n可选物品：\n' + names);
    if (!selectedName) return;
    
    const found = allItems.find(i => i.name === selectedName.trim());
    if (found) {
      const nameEl = document.getElementById('dbEditName');
      if (nameEl) nameEl.value = this._escapeHtml(found.name);
      const enNameEl = document.getElementById('dbItemEnName');
      if (enNameEl) enNameEl.value = this._escapeHtml(found.enName || found.englishName || '');
      const typeEl = document.getElementById('dbItemType');
      if (typeEl) typeEl.value = this._escapeHtml(found.type || found.category || '');
      const rarityEl = document.getElementById('dbItemRarity');
      if (rarityEl) rarityEl.value = this._escapeHtml(found.rarity || '');
      const priceEl = document.getElementById('dbItemPrice');
      if (priceEl) priceEl.value = this._escapeHtml(found.price || '');
      const weightEl = document.getElementById('dbItemWeight');
      if (weightEl) weightEl.value = this._escapeHtml(found.weight || '');
      const descEl = document.getElementById('dbItemDesc');
      if (descEl) descEl.value = this._escapeHtml(found.description || found.desc || '');
      const propsEl = document.getElementById('dbItemProperties');
      if (propsEl) propsEl.value = this._escapeHtml(found.properties || found.effects || '');
    } else {
      alert('未找到该物品');
    }
  },

  /* 数据库盲盒编辑：添加骰点范围行 */
  _addBxRangeRow(min, max, content) {
    const list = document.getElementById('dbBxRangesList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'bx-range-row';
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;';
    div.innerHTML = `
      <input type="text" class="bx-range-min" value="${this._escapeHtml(String(min || ''))}" placeholder="最小" style="width:50px;text-align:center;">
      <span style="color:var(--text-muted);">~</span>
      <input type="text" class="bx-range-max" value="${this._escapeHtml(String(max || ''))}" placeholder="最大" style="width:50px;text-align:center;">
      <input type="text" class="bx-range-content" value="${this._escapeHtml(content || '')}" placeholder="内容" style="flex:1;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  /* 关闭条目编辑弹窗 */
  closeEntryEditor() {
    const modal = document.getElementById('dbEntryModal');
    if (modal) modal.classList.remove('active');
    this._editingEntryId = null;
    this._editingDbKey = null;
  },

  /* 保存条目 */
  saveEntry() {
    if (!this._editingEntryId || !this._editingDbKey) return;

    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[this._editingDbKey]) return;

    const entry = groupDb[this._editingDbKey].find(e => e.id === this._editingEntryId);
    if (!entry) return;

    const nameInput = document.getElementById('dbEditName');
    const contentInput = document.getElementById('dbEditContent');

    if (nameInput) entry.name = nameInput.value.trim();
    if (contentInput) entry.content = contentInput.value;

    // 如果是角色数据，同时更新所有 fields
    if (this._editingDbKey === 'characters') {
      if (!entry.fields) entry.fields = {};

      if (SystemManager.getCurrentSystem() !== 'dnd5r') {
        const gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const tpl = CharTemplateManager.getTemplate();

        const name = gv('dbEditName');
        const faction = gv('dbCharFaction') || 'friendly_npc';
        const hp = gv('dbCharHp');

        entry.name = name;
        entry.fields._name = name;
        entry.fields._faction = faction;
        entry.fields._hp = hp;

        const props = {};
        document.querySelectorAll('.db-prop-input').forEach(el => {
          const propId = el.dataset.prop;
          if (propId) props[propId] = el.value.trim();
        });
        entry.fields._props = props;

        const sections = {};
        tpl.sections.forEach(sec => {
          const listEl = document.querySelector(`.db-char-section-list[data-section="${sec.id}"]`);
          if (!listEl) { sections[sec.id] = []; return; }
          const items = [];
          listEl.querySelectorAll('.char-section-row').forEach(row => {
            const n = row.querySelector('.section-name')?.value.trim() || '';
            const d = row.querySelector('.section-desc')?.value.trim() || '';
            if (n || d) items.push({ name: n, desc: d });
          });
          sections[sec.id] = items;
        });
        entry.fields._sections = sections;
      } else {
        const gv = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

      entry.fields['名称'] = gv('dbEditName');
      entry.name = gv('dbEditName');
      entry.fields['英文名称'] = gv('dbCharEnName');
      entry.fields['体型'] = gv('dbCharSize');
      entry.fields['类型'] = gv('dbCharType');
      entry.fields['阵营'] = gv('dbCharAlignment');
      entry.fields['AC'] = gv('dbCharAC');
      entry.fields['先攻'] = gv('dbCharInitiative');
      entry.fields['HP'] = gv('dbCharHP');
      entry.fields['速度'] = gv('dbCharSpeed');
      entry.fields['力量'] = gv('dbCharSTR');
      entry.fields['敏捷'] = gv('dbCharDEX');
      entry.fields['体质'] = gv('dbCharCON');
      entry.fields['智力'] = gv('dbCharINT');
      entry.fields['感知'] = gv('dbCharWIS');
      entry.fields['魅力'] = gv('dbCharCHA');
      entry.fields['技能'] = gv('dbCharSkill');
      entry.fields['免疫'] = gv('dbCharImmune');
      entry.fields['抗性'] = gv('dbCharResistant');
      entry.fields['感官'] = gv('dbCharSenses');
      entry.fields['语言'] = gv('dbCharLanguages');
      entry.fields['CR'] = gv('dbCharCR');

      // 收集特质
      const traits = [];
      document.querySelectorAll('#dbCharTraitsList .char-trait-row').forEach(row => {
        const title = row.querySelector('.trait-title');
        const desc = row.querySelector('.trait-desc');
        traits.push({ title: title ? title.value.trim() : '', desc: desc ? desc.value.trim() : '' });
      });
      entry.fields['_traits'] = JSON.stringify(traits);

      // 收集动作
      const actions = [];
      document.querySelectorAll('#dbCharActionsList .char-action-row').forEach(row => {
        const title = row.querySelector('.action-title');
        const desc = row.querySelector('.action-desc');
        actions.push({ title: title ? title.value.trim() : '', desc: desc ? desc.value.trim() : '' });
      });
      entry.fields['_actions'] = JSON.stringify(actions);

      // 收集物品
      const items = [];
      document.querySelectorAll('#dbCharItemsList .char-item-row').forEach(row => {
        const name = row.querySelector('.item-name');
        const count = row.querySelector('.item-count');
        const desc = row.querySelector('.item-desc');
        items.push({ 
          name: name ? name.value.trim() : '', 
          count: count ? parseInt(count.value) || 1 : 1,
          desc: desc ? desc.value.trim() : '' 
        });
      });
      entry.fields['_items'] = JSON.stringify(items);

      // 收集法术
      const spells = [];
      document.querySelectorAll('#dbCharSpellsList .char-spell-row').forEach(row => {
        const name = row.querySelector('.spell-name');
        const level = row.querySelector('.spell-level');
        const desc = row.querySelector('.spell-desc');
        spells.push({ 
          name: name ? name.value.trim() : '', 
          level: level ? parseInt(level.value) || 0 : 0,
          desc: desc ? desc.value.trim() : '' 
        });
      });
      entry.fields['_spells'] = JSON.stringify(spells);

      // 其他
      entry.fields['_other'] = gv('dbCharOther');
      }
    }

    // 如果是盲盒数据，收集结构化骰点范围
    if (this._editingDbKey === 'blindbox') {
      const dieTypeEl = document.getElementById('dbBxDieType');
      const headersEl = document.getElementById('dbBxHeaders');
      
      const dieType = dieTypeEl ? dieTypeEl.value : 'd20';
      const headersStr = headersEl ? headersEl.value.trim() : '';
      const headers = headersStr ? headersStr.split(/[、,]/).map(h => h.trim()).filter(Boolean) : [];
      
      const ranges = [];
      document.querySelectorAll('#dbBxRangesList .bx-range-row').forEach(row => {
        const minEl = row.querySelector('.bx-range-min');
        const maxEl = row.querySelector('.bx-range-max');
        const contentEl = row.querySelector('.bx-range-content');
        const min = parseInt(minEl ? minEl.value.trim() : '1') || 1;
        const max = parseInt(maxEl ? maxEl.value.trim() : '5') || 5;
        const content = contentEl ? contentEl.value.trim() : '';
        ranges.push({ min, max, content });
      });
      
      entry.diceRanges = {
        dieType: dieType,
        headers: headers,
        ranges: ranges
      };
    }

    entry.updatedAt = new Date().toISOString();

    // 触发保存
    StorageManager.scheduleSave();

    // 刷新显示
    this.renderDbList();
    this.renderEntries(this._editingDbKey);
    this.closeEntryEditor();

    // 如果带团板数据库面板打开，同步刷新
    if (BoardManager._dbPanelOpen && BoardManager._currentDbKey === this._editingDbKey && BoardManager._currentDbGroup === this._currentDbGroup) {
      BoardManager.renderDbEntries(this._editingDbKey);
      BoardManager.renderDbList();
    }

    DocEditor.showToast('条目已保存', 'success');
  },

  /* 删除条目 */
  deleteEntry(entryId, dbKey) {
    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[dbKey]) return;

    App.showConfirm(
      '确认删除',
      '确定要删除这个条目吗？此操作不可撤销。',
      '删除',
      () => {
        const idx = groupDb[dbKey].findIndex(e => e.id === entryId);
        if (idx >= 0) {
          groupDb[dbKey].splice(idx, 1);
          // 从 placedEntryIds 中移除
          AppState.placedEntryIds.delete(entryId);
          // 触发保存
          StorageManager.scheduleSave();
          // 刷新显示
          this.renderDbList();
          this.renderEntries(dbKey);
          // 如果带团板数据库面板打开，同步刷新
          if (BoardManager._dbPanelOpen && BoardManager._currentDbKey === dbKey && BoardManager._currentDbGroup === this._currentDbGroup) {
            BoardManager.renderDbEntries(dbKey);
            BoardManager.renderDbList();
          }
          DocEditor.showToast('条目已删除', 'success');
        }
      }
    );
  },

  /* HTML 转义 */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  _availableIcons: [
    'i-book', 'i-star', 'i-flag', 'i-target', 'i-map', 'i-search', 'i-dice', 'i-settings',
    'i-alert', 'i-users', 'i-box', 'i-gift', 'i-trophy', 'i-scroll', 'i-folder',
    'i-crown', 'i-flame', 'i-key', 'i-eye', 'i-anchor', 'i-heart', 'i-zap',
    'i-shield', 'i-sword', 'i-wand', 'i-skull', 'i-cog', 'i-globe', 'i-clock',
    'i-compass', 'i-feather', 'i-moon', 'i-sun', 'i-sunrise', 'i-sunset', 'i-web',
    'i-link', 'i-lock', 'i-image', 'i-download', 'i-upload', 'i-home', 'i-save',
    'i-file', 'i-pdf', 'i-info', 'i-check', 'i-arrow-left', 'i-arrow-right',
    'i-clipboard', 'i-trash', 'i-scissors', 'i-bold', 'i-italic',
    'i-underline', 'i-list', 'i-quote', 'i-grid', 'i-columns', 'i-indent',
    'i-outdent', 'i-group', 'i-external', 'i-palette', 'i-panel-left', 'i-expand'
  ],

  _selectedIcon: 'i-star',

  showAddTypeDialog() {
    const modal = document.getElementById('addDbTypeModal');
    if (!modal) return;

    const nameInput = document.getElementById('dbTypeName');
    const descInput = document.getElementById('dbTypeDesc');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';

    this._selectedIcon = 'i-star';
    this._renderIconPicker();

    modal.classList.add('active');
  },

  closeAddTypeDialog() {
    const modal = document.getElementById('addDbTypeModal');
    if (modal) modal.classList.remove('active');
  },

  _renderIconPicker() {
    const list = document.getElementById('dbIconList');
    if (!list) return;

    let html = '';
    for (const iconId of this._availableIcons) {
      const selected = iconId === this._selectedIcon ? 'selected' : '';
      html += `<div class="icon-item ${selected}" data-icon="${iconId}" onclick="DatabaseManager._selectIcon('${iconId}')">`;
      html += `<svg><use href="#${iconId}"/></svg>`;
      html += `</div>`;
    }
    list.innerHTML = html;

    const container = document.querySelector('.icon-scroll-container');
    if (container) {
      let isDragging = false;
      let startX = 0;
      let scrollLeft = 0;

      container.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
      });
      container.addEventListener('mouseleave', () => {
        isDragging = false;
      });
      container.addEventListener('mouseup', () => {
        isDragging = false;
      });
      container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5;
        container.scrollLeft = scrollLeft - walk;
      });

      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }, { passive: false });
    }
  },

  _selectIcon(iconId) {
    this._selectedIcon = iconId;
    this._renderIconPicker();
  },

  addCustomType() {
    const nameInput = document.getElementById('dbTypeName');
    const descInput = document.getElementById('dbTypeDesc');
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) {
      DocEditor.showToast('请输入类型名称', 'error');
      return;
    }

    const mod = AppState.currentModule;
    if (!mod) return;

    if (!mod.customDbTypes) {
      mod.customDbTypes = {};
    }

    const key = 'custom_' + Date.now();
    mod.customDbTypes[key] = {
      name: name,
      icon: this._selectedIcon,
      desc: descInput ? descInput.value.trim() : ''
    };

    const groupDb = this._getGroupDb();
    if (groupDb && !groupDb[key]) {
      groupDb[key] = [];
    }

    const allGroups = mod.databases || {};
    for (const groupKey of Object.keys(allGroups)) {
      if (!allGroups[groupKey][key]) {
        allGroups[groupKey][key] = [];
      }
    }

    StorageManager.scheduleSave();

    this.closeAddTypeDialog();
    this.renderDbList();
    if (BoardManager._dbPanelOpen) {
      BoardManager.renderDbList();
    }

    DocEditor.showToast(`已添加自定义类型「${name}」`, 'success');
  },

  confirmDeleteCustomType(dbKey) {
    const mod = AppState.currentModule;
    if (!mod) return;

    const isBuiltin = this.isBuiltinType(dbKey);
    // 自定义类型需存在于 customDbTypes 中
    if (!isBuiltin && (!mod.customDbTypes || !mod.customDbTypes[dbKey])) return;

    const typeName = isBuiltin
      ? (this.DB_CONFIG[dbKey] ? this.DB_CONFIG[dbKey].name : dbKey)
      : mod.customDbTypes[dbKey].name;

    let totalCount = 0;
    const allGroups = mod.databases || {};
    for (const groupKey of Object.keys(allGroups)) {
      if (allGroups[groupKey][dbKey]) {
        totalCount += allGroups[groupKey][dbKey].length;
      }
    }

    const message = totalCount > 0
      ? `确定要删除「${typeName}」类型吗？该类型下共有 ${totalCount} 条数据，将一起被删除。此操作不可撤销。`
      : `确定要删除「${typeName}」类型吗？此操作不可撤销。`;

    App.showConfirm(
      '确认删除',
      message,
      '删除',
      () => {
        this.deleteCustomType(dbKey);
      }
    );
  },

  deleteCustomType(dbKey) {
    const mod = AppState.currentModule;
    if (!mod) return;

    const isBuiltin = this.isBuiltinType(dbKey);
    // 自定义类型需存在于 customDbTypes 中
    if (!isBuiltin && (!mod.customDbTypes || !mod.customDbTypes[dbKey])) return;

    const typeName = isBuiltin
      ? (this.DB_CONFIG[dbKey] ? this.DB_CONFIG[dbKey].name : dbKey)
      : mod.customDbTypes[dbKey].name;

    if (isBuiltin) {
      // 预置类型：加入 hiddenDbTypes，不再显示
      if (!Array.isArray(mod.hiddenDbTypes)) mod.hiddenDbTypes = [];
      if (!mod.hiddenDbTypes.includes(dbKey)) {
        mod.hiddenDbTypes.push(dbKey);
      }
    } else {
      // 自定义类型：从 customDbTypes 中彻底删除
      delete mod.customDbTypes[dbKey];
    }

    // 清空该类型在当前模组所有库中的数据
    const allGroups = mod.databases || {};
    for (const groupKey of Object.keys(allGroups)) {
      if (allGroups[groupKey][dbKey]) {
        delete allGroups[groupKey][dbKey];
      }
    }

    if (this._currentDbKey === dbKey) {
      this._currentDbKey = null;
    }

    StorageManager.scheduleSave();

    this.renderDbList();
    const fallback = Object.keys(this.getMergedDbConfig()).find(k => k === 'characters') || Object.keys(this.getMergedDbConfig())[0] || 'characters';
    this.selectDb(fallback);
    if (BoardManager._dbPanelOpen) {
      BoardManager.renderDbList();
      BoardManager.selectDb(fallback);
    }

    DocEditor.showToast(`已删除「${typeName}」类型`, 'success');
  }
};

/* ==========================================================================
 * 带团板管理模块 (BoardManager)
 * 负责流程单元、便签、连线、导航、数据库面板等全部带团板功能
 * ========================================================================== */
const BoardManager = {
  currentUnitIndex: 0,
  isDragging: false,
  dragNote: null,
  dragNoteId: null,
  dragUnitIndex: -1,
  dragOffset: { x: 0, y: 0 },
  connectingFrom: null,       // 正在连线的便签 ID
  isConnecting: false,
  contextNoteId: null,         // 右键菜单操作的便签 ID
  contextUnitIndex: -1,
  _dbPanelOpen: false,
  _dbPanelWide: false,
  _currentDbKey: null,
  _currentDbGroup: null,
  _multiSelectMode: false,
  _selectedEntryIds: new Set(),
  _initialized: false,
  // 拉伸状态
  _isResizing: false,
  _resizeNoteId: null,
  _resizeUnitIndex: -1,
  _resizeStartSize: { w: 0, h: 0 },
  _resizeStartPos: { x: 0, y: 0 },
  // 战斗模块拉伸状态
  _boIsResizing: false,
  _boResizeTarget: null,
  // 框选状态
  _isSelecting: false,
  _selectionStart: { x: 0, y: 0 },
  _selectionEnd: { x: 0, y: 0 },
  _selectedNoteIds: new Set(),
  _selectionCanvasIndex: -1,
  // 虚拟坐标系统
  viewport: { x: 0, y: 0 },  // 当前视口在虚拟坐标系中的位置
  scale: 1,  // 当前缩放比例
  // 画布平移状态
  _isCanvasPanning: false,
  _panStart: { x: 0, y: 0 },
  _panStartViewport: { x: 0, y: 0 },
  _panButton: 0, // 哪个鼠标按钮触发的平移 (0=左键, 2=右键)
  // 多选拖拽状态
  _isMultiDrag: false,
  _multiDragNotes: [], // { noteId, unitIndex, startX, startY }
  // 连线工具状态
  _isErasingConnections: false,
  _waitingForConnectSource: false,
  // 撤回/恢复
  _undoStack: [],
  _redoStack: [],
  _maxUndoSteps: 50,
  // 便签编辑状态
  _editingNote: null,
  // 背景框状态
  _selectedBgFrame: null,
  _bgFrameDragging: false,
  _bgFrameResizing: false,
  _bgFrameTarget: null,
  _bgFrameUnitIndex: -1,

  // 鸟瞰图状态
  _minimapVisible: true,
  _minimapPosition: null,
  _minimapDragState: null,

  /* 便签类型图标映射 */
  

  /* 状态条件名称→CSS类名映射 */
  STATUS_KEYS: {
    '目盲': 'blinded', '魅惑': 'charmed', '耳聋': 'deafened',
    '恐慌': 'frightened', '擒抱': 'grappled', '失能': 'incapacitated',
    '隐形': 'invisible', '麻痹': 'paralyzed', '石化': 'petrified',
    '中毒': 'poisoned', '倒地': 'prone', '束缚': 'restrained',
    '震慑': 'stunned', '昏迷': 'unconscious', '专注': 'concentrating'
  },

  /* 预设状态列表（用于状态选择器） */
  STATUS_PRESETS: [
    '目盲', '魅惑', '耳聋', '恐慌', '擒抱', '失能',
    '隐形', '麻痹', '石化', '中毒', '倒地', '束缚',
    '震慑', '昏迷', '专注'
  ],

  /* 连线可选颜色 */
  CONNECTION_COLORS: ['#c0ab84', '#a03030', '#2c5aa0', '#27864a', '#9b59b6', '#e67e22', '#e74c3c', '#7f8c8d'],

  /* ==================== 初始化 ==================== */

  init() {
    if (!AppState.currentModule) return;
    this._initialized = true;
    this.loadBoard();
    this.render();
    this._restoreMinimapState();

    // 初始化当前单元的视口
    const vp = this._getUnitViewport();
    this.viewport = { x: vp.x, y: vp.y };
    this.scale = vp.scale;
    this._updateCanvasTransform();
    this._updateUnitHeader();

    // 重建 placedEntryIds
    this._rebuildPlacedIds();

    // 如果没有流程单元，显示初始化向导
    if (this.getFlowUnits().length === 0) {
      this.showSetupWizard();
    }

    // 全局鼠标事件（拖拽和连线）
    this._bindGlobalEvents();

    // 初始化画布平移
    this._bindCanvasPan();

    // 初始化缩略图条拖拽滑动
    this._bindThumbnailDrag();

    // 初始化带团板搜索输入框
    this._initBoardSearchInput();

    // 初始化世界时钟
    WorldClock.init();

    // 战斗模块 alerts-bar 窗口 resize 联动
    let _boResizeRaf = null;
    window.addEventListener('resize', () => {
      if (_boResizeRaf) return;
      _boResizeRaf = requestAnimationFrame(() => {
        _boResizeRaf = null;
        BoardManager._boRepositionAlertsBar();
      });
    });

    // 行动卡片 & 先攻序列表：拖拽滚动 + 滚轮横向滚动
    this._boBindScrollEvents();
  },

  /* 绑定全局鼠标/键盘事件 */
  _bindGlobalEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    document.addEventListener('pointermove', (e) => this._onGlobalPointerMove(e));
    document.addEventListener('pointerup', (e) => this._onGlobalPointerUp(e));
    document.addEventListener('pointercancel', (e) => this._onGlobalPointerUp(e));

    let _resizeRaf = null;
    window.addEventListener('resize', () => {
      if (_resizeRaf) return;
      _resizeRaf = requestAnimationFrame(() => {
        _resizeRaf = null;
        this.renderMinimap();
        this.renderConnections(this.currentUnitIndex);
      });
    });

    // 视口空白区域右键退出连线模式
    const viewport = document.getElementById('boardViewport');
    if (viewport) {
      viewport.addEventListener('contextmenu', (e) => {
        if (this._waitingForConnectSource || this.isConnecting) {
          e.preventDefault();
          this._exitConnectMode();
        } else if (this._isErasingConnections) {
          e.preventDefault();
          this._exitEraseMode();
        }
      });
      // 擦除模式跟随气泡
      viewport.addEventListener('mousemove', (e) => {
        if (!this._isErasingConnections) return;
        this._eraseTooltipTick = this._eraseTooltipTick || 0;
        const now = Date.now();
        if (now - this._eraseTooltipTick < 50) return;
        this._eraseTooltipTick = now;
        const line = e.target.closest('.connection-line');
        const tooltip = document.getElementById('eraseTooltip');
        if (line && tooltip) {
          tooltip.style.left = e.clientX + 'px';
          tooltip.style.top = e.clientY + 'px';
          tooltip.classList.add('visible');
        } else if (tooltip) {
          tooltip.classList.remove('visible');
        }
      });
      // 鼠标离开视口时隐藏气泡
      viewport.addEventListener('mouseleave', () => {
        this._hideEraseTooltip();
      });
    }

    // 拖拽图片文件到画布插入（仅 Electron）
    if (viewport) {
      viewport.addEventListener('dragover', (e) => {
        if (!window.electronAPI) return;
        // 检查是否有文件拖拽
        if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      });
      viewport.addEventListener('drop', async (e) => {
        if (!window.electronAPI) return;
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
        for (const file of files) {
          const ext = file.name.split('.').pop().toLowerCase();
          if (!imageExts.includes(ext)) continue;
          e.preventDefault();
          // 计算放置点的虚拟坐标（相对于画布容器）
          const canvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
          if (!canvasEl) continue;
          const parentEl = canvasEl.parentElement;
          const parentRect = parentEl ? parentEl.getBoundingClientRect() : { left: 0, top: 0 };
          const screenX = e.clientX - parentRect.left;
          const screenY = e.clientY - parentRect.top;
          const virt = this._screenToVirtual(screenX, screenY);
          // Electron 的 File 对象有 path 属性
          const filePath = file.path;
          if (filePath) {
            await this._addImageToCanvas(filePath, virt.x, virt.y);
          }
          break; // 只处理第一张图
        }
      });
    }

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (AppState.currentPage !== 'board') return;
      // 输入框中不拦截方向键，允许正常光标移动
      if (e.target.closest('input, textarea, select') || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.prevUnit(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.nextUnit(); }
      if (e.key === 'Escape') {
        this.hideContextMenu();
        this._deselectBgFrame();
        this._hideBgFrameCtxMenu();
        this._exitConnectMode();
        this._exitEraseMode();
        this.hideOverview();
        this._clearSelection();
        // 关闭搜索栏
        const searchBar = document.getElementById('boardSearchBar');
        if (searchBar && searchBar.classList.contains('visible')) {
          this.toggleSearch();
        }
      }
      // Ctrl+F 切换搜索栏
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.toggleSearch();
        return;
      }
      // 撤回/恢复快捷键
      if (e.target.closest('input, textarea, select, #editorContent')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
      // Delete 键批量删除选中便签
      if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedNoteIds.size > 0) {
        e.preventDefault();
        if (confirm('确定删除选中的 ' + this._selectedNoteIds.size + ' 个便签吗？')) {
          const units = this.getFlowUnits();
          const unit = units[this.currentUnitIndex];
          if (!unit) return;
          this._selectedNoteIds.forEach(id => {
            // 跳过锁定便签
            const note = unit.notes.find(n => n.id === id);
            if (note && note.locked) return;
            // 移除关联连线
            unit.connections = unit.connections.filter(c => c.from !== id && c.to !== id);
            // 更新 placedEntryIds
            if (note && note.sourceEntryId) {
              let stillUsed = false;
              for (const u of units) {
                if (u.notes.some(n => n.sourceEntryId === note.sourceEntryId && n.id !== id)) {
                  stillUsed = true;
                  break;
                }
              }
              if (!stillUsed) AppState.placedEntryIds.delete(note.sourceEntryId);
            }
          });
          DatabaseManager.renderDbList();
          BoardManager.renderDbList();
          unit.notes = unit.notes.filter(n => !this._selectedNoteIds.has(n.id) || n.locked);
          this._selectedNoteIds.clear();
          this.renderUnitNotes(this.currentUnitIndex);
          this.renderConnections(this.currentUnitIndex);
          if (this._dbPanelOpen && this._currentDbKey) {
            this.renderDbEntries(this._currentDbKey);
          }
          this.saveBoard();
          StorageManager.scheduleSave();
        }
      }
      // Ctrl+C 复制选中便签文本
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this._selectedNoteIds.size > 0) {
        e.preventDefault();
        const firstId = this._selectedNoteIds.values().next().value;
        if (firstId) {
          this.copyNoteText(firstId, this.currentUnitIndex);
        }
      }
    });

    // 点击空白处关闭菜单
    document.addEventListener('click', (e) => {
      if (AppState.currentPage !== 'board') return;
      const menu = document.getElementById('noteContextMenu');
      if (menu && menu.classList.contains('visible') && !menu.contains(e.target)) {
        this.hideContextMenu();
      }
      const colorPicker = document.getElementById('connectionColorPicker');
      if (colorPicker && colorPicker.classList.contains('visible') && !colorPicker.contains(e.target)) {
        if (this._pickerOpenTime && Date.now() - this._pickerOpenTime < 300) return;
        colorPicker.classList.remove('visible');
      }
    });
  },

  /* 绑定画布平移功能（鼠标拖拽空白区域 / 空格+拖拽 / 鼠标滚轮） */
  _bindCanvasPan() {
    if (this._canvasPanBound) return;
    this._canvasPanBound = true;

    this._isCanvasPanning = false;
    this._panStart = { x: 0, y: 0 };
    this._panStartViewport = { x: 0, y: 0 };
    this._spacePressed = false;
    this._panButton = 0;

    // 监听空格键
    document.addEventListener('keydown', (e) => {
      if (AppState.currentPage !== 'board') return;
      if (e.code === 'Space' && !e.target.closest('input, textarea, select') && !e.target.isContentEditable) {
        e.preventDefault();
        this._spacePressed = true;
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spacePressed = false;
        if (this._isCanvasPanning && this._panButton === 0) {
          this._isCanvasPanning = false;
          document.body.style.cursor = '';
        }
      }
    });

    document.addEventListener('pointerdown', (e) => {
      const isOnViewport = e.target.closest('.board-viewport');
      const isOnNote = e.target.closest('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card, .bg-frame:not(.locked)');
      const isOnButton = e.target.closest('button, a, input, textarea, select, .board-toolbar, .board-unit-header, .board-connection-tools, .board-minimap, .board-thumbnails, .board-db-panel');
      if (!isOnViewport || isOnNote || isOnButton) return;

      const viewport = document.getElementById('boardViewport');
      if (e.button === 2 || this._spacePressed) {
        e.preventDefault();
        this._isCanvasPanning = true;
        this._panButton = e.button;
        this._panStart.x = e.clientX;
        this._panStart.y = e.clientY;
        const vp = this._getUnitViewport();
        this._panStartViewport.x = vp.x;
        this._panStartViewport.y = vp.y;
        document.body.style.cursor = 'grabbing';
        if (viewport) {
          viewport.setPointerCapture(e.pointerId);
          this._activePointerTarget = viewport;
          this._activePointerId = e.pointerId;
        }
      } else if (e.button === 0) {
        this._deselectBgFrame();
        this.hideContextMenu();
        this._hideBgFrameCtxMenu();
        const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
        if (!canvas) return;
        this._isSelecting = true;
        this._selectionCanvasIndex = this.currentUnitIndex;
        const rect = canvas.getBoundingClientRect();
        const vStart = this._screenToVirtual(e.clientX - rect.left, e.clientY - rect.top, this._selectionCanvasIndex);
        this._selectionStart = vStart;
        this._selectionEnd = { ...vStart };
        this._clearSelection();
        const box = document.createElement('div');
        box.className = 'selection-box';
        box.id = 'selectionBox';
        canvas.appendChild(box);
        if (canvas) canvas.setPointerCapture(e.pointerId);
        this._activePointerId = e.pointerId;
        this._activePointerTarget = canvas;
      }
    });

    // 阻止画布区域的默认右键菜单
    document.addEventListener('contextmenu', (e) => {
      if (AppState.currentPage !== 'board') return;
      const isOnViewport = e.target.closest('.board-viewport');
      const isOnNote = e.target.closest('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card, .bg-frame');
      const isOnButton = e.target.closest('button, a, input, textarea, select, .board-toolbar, .board-unit-header, .board-connection-tools, .board-minimap, .board-thumbnails, .board-db-panel');
      if (isOnViewport && !isOnNote && !isOnButton) {
        e.preventDefault();
      }
    });

    // 鼠标滚轮缩放（丝滑自由缩放，以鼠标位置为中心）
    document.addEventListener('wheel', (e) => {
      if (AppState.currentPage !== 'board') return;
      const flowUnit = e.target.closest('.flow-unit');
      if (!flowUnit) return;

      // 可滚动区域（textarea、溢出容器等）不触发缩放
      const scrollTarget = e.target.closest('textarea, .combat-log-entries');
      if (scrollTarget && scrollTarget.scrollHeight > scrollTarget.clientHeight) return;

      e.preventDefault();

      // RAF 防抖，避免快速滚轮堆积调用
      if (this._zoomRafId) return;
      const dY = e.deltaY, cX = e.clientX, cY = e.clientY;
      const canvas = flowUnit.querySelector('.flow-unit-canvas');
      if (!canvas) return;
      const self = this;

      this._zoomRafId = requestAnimationFrame(() => {
        self._zoomRafId = null;

        const currentScale = self.scale || 1;
        const step = 0.02;
        const delta = dY > 0 ? -step : step;
        let newScale = currentScale + delta;
        newScale = Math.max(0.3, Math.min(3.0, newScale));
        newScale = Math.round(newScale * 100) / 100;

        const canvasRect = canvas.getBoundingClientRect();
        const mouseScreenX = cX - canvasRect.left;
        const mouseScreenY = cY - canvasRect.top;

        const mouseVirtualX = mouseScreenX / currentScale;
        const mouseVirtualY = mouseScreenY / currentScale;

        // 鼠标相对于视口（canvas父元素）的位置，不含CSS transform偏移
        const mouseDocX = mouseScreenX - self.viewport.x * currentScale;
        const mouseDocY = mouseScreenY - self.viewport.y * currentScale;

        const newViewportX = mouseVirtualX - mouseDocX / newScale;
        const newViewportY = mouseVirtualY - mouseDocY / newScale;

        self._setUnitViewport(newViewportX, newViewportY, newScale);

        // 缩放时同步刷新框选矩形位置
        if (self._isSelecting) {
          self._updateSelectionBox();
        }

        const indicator = document.getElementById('zoomIndicator');
        if (indicator) {
          indicator.textContent = Math.round(newScale * 100) + '%';
          indicator.classList.add('visible');
          clearTimeout(self._zoomIndicatorTimer);
          self._zoomIndicatorTimer = setTimeout(() => indicator.classList.remove('visible'), 1500);
        }
      });
    }, { passive: false });
  },

  /* 绑定缩略图条鼠标拖拽滑动 */
  _bindThumbnailDrag() {
    if (this._thumbDragBound) return;
    this._thumbDragBound = true;

    const thumbBar = document.getElementById('boardThumbnails');
    if (!thumbBar) return;

    let isThumbDrag = false;
    let thumbStartX = 0;
    let thumbScrollLeft = 0;

    thumbBar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.thumbnail-item')) return;
      isThumbDrag = true;
      thumbStartX = e.pageX - thumbBar.offsetLeft;
      thumbScrollLeft = thumbBar.scrollLeft;
      thumbBar.style.cursor = 'grabbing';
      thumbBar.setPointerCapture(e.pointerId);
    });
    thumbBar.addEventListener('pointermove', (e) => {
      if (!isThumbDrag) return;
      e.preventDefault();
      const x = e.pageX - thumbBar.offsetLeft;
      const walk = (x - thumbStartX) * 1.5;
      thumbBar.scrollLeft = thumbScrollLeft - walk;
    });
    thumbBar.addEventListener('pointerup', () => {
      isThumbDrag = false;
      thumbBar.style.cursor = '';
    });
    thumbBar.addEventListener('pointercancel', () => {
      isThumbDrag = false;
      thumbBar.style.cursor = '';
    });
  },

  /* ==================== 数据访问 ==================== */

  /* 获取当前模组的 board 数据 */
  getBoard() {
    if (!AppState.currentModule) return null;
    return AppState.currentModule.board;
  },

  /* 获取流程单元列表 */
  getFlowUnits() {
    const board = this.getBoard();
    return board ? board.flowUnits : [];
  },

  /* 获取当前流程单元 */
  getCurrentUnit() {
    const units = this.getFlowUnits();
    return units[this.currentUnitIndex] || null;
  },

  /* 根据 ID 查找便签 */
  findNote(noteId) {
    const units = this.getFlowUnits();
    for (let i = 0; i < units.length; i++) {
      const note = units[i].notes.find(n => n.id === noteId);
      if (note) return { note, unitIndex: i };
    }
    return null;
  },

  /* 重建 placedEntryIds 集合 */
  _rebuildPlacedIds() {
    AppState.placedEntryIds.clear();
    const units = this.getFlowUnits();
    for (const unit of units) {
      for (const note of unit.notes) {
        if (note.sourceEntryId) {
          AppState.placedEntryIds.add(note.sourceEntryId);
        }
      }
    }
  },

  /* ==================== 虚拟坐标系统 ==================== */

  /* 获取当前流程单元的视口状态 */
  _getUnitViewport() {
    const unit = this.getCurrentUnit();
    if (!unit) return { x: 0, y: 0, scale: 1 };
    if (!unit.viewport) {
      unit.viewport = { x: 0, y: 0, scale: 1 };
    }
    return unit.viewport;
  },

  /* 设置当前流程单元的视口状态 */
  _setUnitViewport(x, y, scale) {
    const unit = this.getCurrentUnit();
    if (!unit) return;
    if (!unit.viewport) unit.viewport = { x: 0, y: 0, scale: 1 };
    unit.viewport.x = x;
    unit.viewport.y = y;
    if (scale !== undefined) unit.viewport.scale = scale;
    this.viewport = { x, y };
    this.scale = unit.viewport.scale;
    this._updateCanvasTransform();
    this.renderMinimap();
  },

  /* 屏幕坐标转虚拟坐标（screenX/Y 是 canvas.getBoundingClientRect 相对坐标） */
  _screenToVirtual(screenX, screenY, unitIndex) {
    const idx = unitIndex !== undefined ? unitIndex : this.currentUnitIndex;
    const units = this.getFlowUnits();
    const unit = units[idx];
    const vp = unit && unit.viewport ? unit.viewport : { x: 0, y: 0, scale: 1 };
    const s = vp.scale || 1;
    return {
      x: screenX / s,
      y: screenY / s
    };
  },

  /* 虚拟坐标转 canvas 本地坐标（canvas 子元素定位用，CSS transform 自动处理映射） */
  _virtualToScreen(virtualX, virtualY, unitIndex) {
    const idx = unitIndex !== undefined ? unitIndex : this.currentUnitIndex;
    const units = this.getFlowUnits();
    const unit = units[idx];
    const vp = unit && unit.viewport ? unit.viewport : { x: 0, y: 0, scale: 1 };
    const s = vp.scale || 1;
    return {
      x: virtualX * s,
      y: virtualY * s
    };
  },

  /* 更新画布 transform */
  _updateCanvasTransform(unitIndex) {
    const idx = unitIndex !== undefined ? unitIndex : this.currentUnitIndex;
    const canvas = document.getElementById('unitCanvas_' + idx);
    if (!canvas) return;
    const units = this.getFlowUnits();
    const unit = units[idx];
    const vp = unit && unit.viewport ? unit.viewport : { x: 0, y: 0, scale: 1 };
    const s = vp.scale || 1;
    canvas.style.transform = `translate(${-vp.x * s}px, ${-vp.y * s}px) scale(${s})`;
    canvas.style.transformOrigin = '0 0';
    // 动态调整伪元素背景位置
    canvas.style.setProperty('--bg-x', `${-vp.x * s + 50000}px`);
    canvas.style.setProperty('--bg-y', `${-vp.y * s + 50000}px`);
  },

  /* 更新固定标题栏 */
  _updateUnitHeader() {
    const unit = this.getCurrentUnit();
    const titleText = unit ? (unit.title || '未命名单元') : '';
    const descText = unit ? (unit.description || '') : '';

    let titleEl = document.getElementById('unitHeaderTitle');
    let descEl = document.getElementById('unitHeaderDesc');

    if (titleEl) {
      titleEl.textContent = titleText;
    } else {
      // 编辑模式：找到输入框，替换回 h2
      const titleInput = document.querySelector('#boardUnitHeader .unit-header-title-input');
      if (titleInput) {
        const newH2 = document.createElement('h2');
        newH2.id = 'unitHeaderTitle';
        newH2.textContent = titleText;
        newH2.ondblclick = () => this.editUnitTitleFromHeader();
        titleInput.replaceWith(newH2);
        // 移除保存按钮，恢复编辑按钮
        const saveBtn = document.querySelector('#boardUnitHeader .unit-save-title-btn');
        if (saveBtn) saveBtn.remove();
        const editBtn = document.querySelector('#boardUnitHeader .unit-edit-btn');
        if (editBtn) editBtn.style.display = '';
      }
    }

    if (descEl) {
      descEl.textContent = descText;
    } else {
      const descInput = document.querySelector('#boardUnitHeader .unit-header-desc-input');
      if (descInput) {
        const newP = document.createElement('p');
        newP.id = 'unitHeaderDesc';
        newP.textContent = descText;
        newP.ondblclick = () => this.editUnitDescFromHeader();
        descInput.replaceWith(newP);
        const saveBtn = document.querySelector('#boardUnitHeader .unit-save-desc-btn');
        if (saveBtn) saveBtn.remove();
        const editBtn = document.querySelector('#boardUnitHeader .unit-edit-desc-btn');
        if (editBtn) editBtn.style.display = '';
      }
    }
  },

  /* 编辑固定标题栏标题 */
  editUnitTitleFromHeader() {
    const unit = this.getCurrentUnit();
    if (!unit) return;
    const titleEl = document.getElementById('unitHeaderTitle');
    if (!titleEl) return;

    // 隐藏编辑按钮
    const editBtn = titleEl.parentElement.querySelector('.unit-edit-btn');
    if (editBtn) editBtn.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'flow-unit-title-input unit-header-title-input';
    input.value = unit.title || '';

    const save = () => {
      unit.title = input.value || '未命名单元';
      this.saveBoard();
      StorageManager.scheduleSave();
      this._updateUnitHeader();
      this.renderThumbnails();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { save(); }
      if (e.key === 'Escape') { input.value = unit.title; save(); }
    });

    titleEl.replaceWith(input);

    // 插入保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.className = 'unit-save-btn unit-save-title-btn';
    saveBtn.title = '保存';
    saveBtn.innerHTML = '<span class="icon"><svg><use href="#i-check"/></svg></span>';
    saveBtn.onclick = save;
    input.after(saveBtn);

    input.focus();
    input.select();
  },

  /* 编辑固定标题栏描述 */
  editUnitDescFromHeader() {
    const unit = this.getCurrentUnit();
    if (!unit) return;
    const descEl = document.getElementById('unitHeaderDesc');
    if (!descEl) return;

    // 隐藏编辑按钮
    const editBtn = descEl.parentElement.querySelector('.unit-edit-desc-btn');
    if (editBtn) editBtn.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'unit-header-desc-input';
    input.style.cssText = 'font-size:13px;color:var(--text-muted);border:1px solid var(--accent);border-radius:4px;padding:2px 8px;outline:none;background:var(--card);text-align:center;min-width:200px;';
    input.value = unit.description || '';

    const save = () => {
      unit.description = input.value;
      this.saveBoard();
      StorageManager.scheduleSave();
      this._updateUnitHeader();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { save(); }
      if (e.key === 'Escape') { input.value = unit.description; save(); }
    });

    descEl.replaceWith(input);

    // 插入保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.className = 'unit-save-btn unit-save-desc-btn';
    saveBtn.title = '保存';
    saveBtn.innerHTML = '<span class="icon"><svg><use href="#i-check"/></svg></span>';
    saveBtn.onclick = save;
    input.after(saveBtn);

    input.focus();
    input.select();
  },

  /* 渲染鸟瞰图 */
  renderMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    if (!canvas) return;
    const unit = this.getCurrentUnit();
    if (!unit) { canvas.innerHTML = ''; return; }

    // 计算所有便签的边界框
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    const padding = 200;
    if (unit.notes.length > 0) {
      minX = maxX = unit.notes[0].x;
      minY = maxY = unit.notes[0].y;
      for (const n of unit.notes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + (n.width || 200));
        maxY = Math.max(maxY, n.y + 100);
      }
    }
    minX -= padding; minY -= padding;
    maxX += padding; maxY += padding;

    const boundsW = maxX - minX || 400;
    const boundsH = maxY - minY || 300;
    const mapW = 160, mapH = 120;
    const scaleX = mapW / boundsW;
    const scaleY = mapH / boundsH;
    const scale = Math.min(scaleX, scaleY);

    const vp = unit.viewport || { x: 0, y: 0, scale: 1 };
    const s = vp.scale || 1;

    // 使用 unitCanvas 的父容器尺寸计算实际可见画布区域
    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth / s;
      viewH = unitCanvasEl.parentElement.clientHeight / s;
    }

    // 使用 unit.viewport 确保与 _updateCanvasTransform / _virtualToScreen 一致
    const actualVpX = vp.x;
    const actualVpY = vp.y;

    let html = '';
    // 视口矩形
    const vx = (actualVpX - minX) * scale;
    const vy = (actualVpY - minY) * scale;
    const vw = viewW * scale;
    const vh = viewH * scale;
    html += `<div class="board-minimap-viewport" style="left:${vx}px;top:${vy}px;width:${vw}px;height:${vh}px;"></div>`;

    // 便签点
    for (const n of unit.notes) {
      const nx = (n.x - minX) * scale;
      const ny = (n.y - minY) * scale;
      const nw = ((n.width || 200) * scale);
      const nh = (80 * scale);
      html += `<div class="board-minimap-dot" style="left:${nx}px;top:${ny}px;width:${nw}px;height:${nh}px;border-radius:2px;opacity:0.6;"></div>`;
    }

    canvas.innerHTML = html;

    // 点击鸟瞰图跳转
    canvas.onclick = (e) => {
      if (this._minimapWasDragged) { this._minimapWasDragged = false; return; }
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // 计算点击位置在虚拟坐标系中的位置
      const virtualX = minX + (clickX / scale);
      const virtualY = minY + (clickY / scale);

      // 使用 unitCanvas 的父容器尺寸计算实际可见画布区域
      const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
      let viewW = 800, viewH = 600;
      if (unitCanvasEl && unitCanvasEl.parentElement) {
        viewW = unitCanvasEl.parentElement.clientWidth;
        viewH = unitCanvasEl.parentElement.clientHeight;
      }

      // 将视口中心移动到点击位置
      this._setUnitViewport(virtualX - viewW / 2, virtualY - viewH / 2);
    };
  },

  /* ==================== 鸟瞰图开关/拖拽 ==================== */

  toggleMinimapVisibility() {
    this._minimapVisible = !this._minimapVisible;
    this._applyMinimapState();
    this._saveMinimapState();
  },

  _applyMinimapState() {
    const minimap = document.getElementById('boardMinimap');
    const toggle = document.getElementById('boardMinimapToggle');
    if (!minimap || !toggle) return;
    minimap.classList.toggle('minimap-hidden', !this._minimapVisible);
    toggle.classList.toggle('active', this._minimapVisible);
    if (this._minimapVisible && this._minimapPosition) {
      minimap.style.top = this._minimapPosition.top + 'px';
      minimap.style.left = this._minimapPosition.left + 'px';
    }
  },

  _saveMinimapState() {
    const mod = AppState.currentModule;
    if (!mod || !mod.board) return;
    if (!mod.board.minimapState) mod.board.minimapState = {};
    mod.board.minimapState.visible = this._minimapVisible;
    if (this._minimapPosition) {
      mod.board.minimapState.position = { ...this._minimapPosition };
    }
  },

  _restoreMinimapState() {
    const mod = AppState.currentModule;
    if (mod && mod.board && mod.board.minimapState) {
      this._minimapVisible = mod.board.minimapState.visible !== false;
      if (mod.board.minimapState.position) {
        this._minimapPosition = { ...mod.board.minimapState.position };
      }
    } else {
      this._minimapVisible = true;
      this._minimapPosition = null;
    }
    this._applyMinimapState();
    this._bindMinimapDrag();
  },

  _bindMinimapDrag() {
    const minimap = document.getElementById('boardMinimap');
    if (!minimap) return;
    if (this._minimapDragMoveBound) {
      document.removeEventListener('mousemove', this._minimapDragMoveBound);
      document.removeEventListener('mouseup', this._minimapDragEndBound);
    }
    minimap.onmousedown = (e) => {
      if (e.button !== 0) return;
      const rect = minimap.getBoundingClientRect();
      this._minimapDragState = {
        startX: e.clientX, startY: e.clientY,
        startLeft: rect.left, startTop: rect.top,
        dragging: false
      };
      this._minimapDragMoveBound = (ev) => this._onMinimapDrag(ev);
      this._minimapDragEndBound = (ev) => this._onMinimapDragEnd(ev);
      document.addEventListener('mousemove', this._minimapDragMoveBound);
      document.addEventListener('mouseup', this._minimapDragEndBound);
    };
  },

  _onMinimapDrag(e) {
    const state = this._minimapDragState;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.dragging && Math.abs(dx) + Math.abs(dy) < 5) return;
    state.dragging = true;
    const minimap = document.getElementById('boardMinimap');
    if (!minimap) return;
    minimap.classList.add('minimap-dragging');
    const newLeft = Math.max(0, state.startLeft + dx);
    const newTop = Math.max(0, state.startTop + dy);
    minimap.style.left = newLeft + 'px';
    minimap.style.top = newTop + 'px';
  },

  _onMinimapDragEnd(e) {
    const state = this._minimapDragState;
    if (!state) return;
    document.removeEventListener('mousemove', this._minimapDragMoveBound);
    document.removeEventListener('mouseup', this._minimapDragEndBound);
    const minimap = document.getElementById('boardMinimap');
    if (minimap) minimap.classList.remove('minimap-dragging');
    if (state.dragging) {
      this._minimapWasDragged = true;
      const rect = minimap.getBoundingClientRect();
      this._minimapPosition = { left: rect.left, top: rect.top };
      this._saveMinimapState();
    }
    this._minimapDragState = null;
  },

  /* ==================== 撤回/恢复 ==================== */

  /* 记录操作到撤回栈 */
  _pushUndo(action) {
    this._undoStack.push(action);
    if (this._undoStack.length > this._maxUndoSteps) {
      this._undoStack.shift();
    }
    this._redoStack = []; // 新操作清空恢复栈
  },

  /* 撤回 */
  undo() {
    if (this._undoStack.length === 0) return;
    const action = this._undoStack.pop();
    this._redoStack.push(action);
    this._executeUndo(action);
  },

  /* 恢复 */
  redo() {
    if (this._redoStack.length === 0) return;
    const action = this._redoStack.pop();
    this._undoStack.push(action);
    this._executeRedo(action);
  },

  /* 执行撤回 */
  _executeUndo(action) {
    const unitIndex = action.unitIndex;
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const canvas = document.getElementById('unitCanvas_' + unitIndex);

    switch (action.type) {
      case 'addNote':
        // 撤回添加 = 删除
        const addIdx = unit.notes.findIndex(n => n.id === action.noteId);
        if (addIdx !== -1) {
          unit.notes.splice(addIdx, 1);
          unit.connections = unit.connections.filter(c => c.from !== action.noteId && c.to !== action.noteId);
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) el.remove();
          this.renderConnections(unitIndex);
          this.renderMinimap();
          this._updateEmptyPrompt(unitIndex);
        }
        break;
      case 'deleteNote':
        // 撤回删除 = 重新添加
        if (action.noteData) {
          unit.notes.push(action.noteData);
          if (canvas) this.renderNote(action.noteData, canvas, unitIndex);
          if (action.connectionsData) {
            unit.connections.push(...action.connectionsData);
          }
          requestAnimationFrame(() => {
            this.renderConnections(unitIndex);
            this.renderMinimap();
          });
          this._updateEmptyPrompt(unitIndex);
        }
        break;
      case 'moveNote':
        // 撤回移动 = 恢复原位置
        const moveNote = unit.notes.find(n => n.id === action.noteId);
        if (moveNote) {
          moveNote.x = action.oldX;
          moveNote.y = action.oldY;
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) {
            el.style.left = moveNote.x + 'px';
            el.style.top = moveNote.y + 'px';
          }
          this.renderConnections(unitIndex);
          this.renderMinimap();
        }
        break;
      case 'editNote':
        // 撤回编辑 = 恢复旧数据
        const editNote = unit.notes.find(n => n.id === action.noteId);
        if (editNote && action.oldData) {
          Object.assign(editNote, action.oldData);
          const oldEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (oldEl) oldEl.remove();
          if (canvas) this.renderNote(editNote, canvas, unitIndex);
          requestAnimationFrame(() => {
            this.renderConnections(unitIndex);
            this.renderMinimap();
          });
        }
        break;
      case 'toggleUsed':
        const usedNote = unit.notes.find(n => n.id === action.noteId);
        if (usedNote) {
          usedNote.used = !usedNote.used;
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) el.classList.toggle('used', usedNote.used);
        }
        break;
      case 'toggleLock':
        const lockNote = unit.notes.find(n => n.id === action.noteId);
        if (lockNote) {
          lockNote.locked = !lockNote.locked;
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) {
            const btn = el.querySelector('.lock-btn');
            if (btn) {
              btn.classList.toggle('locked', lockNote.locked);
              btn.title = lockNote.locked ? '已锁定' : '点击锁定位置';
            }
          }
        }
        break;
      case 'addConnection':
        unit.connections = unit.connections.filter(c => !(c.from === action.from && c.to === action.to));
        this.renderConnections(unitIndex);
        break;
      case 'deleteConnection':
        if (action.connectionData) {
          unit.connections.push(action.connectionData);
          this.renderConnections(unitIndex);
        }
        break;
    }
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 执行恢复（与撤回相反） */
  _executeRedo(action) {
    const unitIndex = action.unitIndex;
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const canvas = document.getElementById('unitCanvas_' + unitIndex);

    switch (action.type) {
      case 'addNote':
        if (action.noteData) {
          unit.notes.push(action.noteData);
          if (canvas) this.renderNote(action.noteData, canvas, unitIndex);
          if (action.connectionsData) unit.connections.push(...action.connectionsData);
          requestAnimationFrame(() => {
            this.renderConnections(unitIndex);
            this.renderMinimap();
          });
          this._updateEmptyPrompt(unitIndex);
        }
        break;
      case 'deleteNote':
        const delIdx = unit.notes.findIndex(n => n.id === action.noteId);
        if (delIdx !== -1) {
          unit.notes.splice(delIdx, 1);
          unit.connections = unit.connections.filter(c => c.from !== action.noteId && c.to !== action.noteId);
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) el.remove();
          this.renderConnections(unitIndex);
          this.renderMinimap();
          this._updateEmptyPrompt(unitIndex);
        }
        break;
      case 'moveNote':
        const moveN = unit.notes.find(n => n.id === action.noteId);
        if (moveN) {
          moveN.x = action.newX;
          moveN.y = action.newY;
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (el) {
            el.style.left = moveN.x + 'px';
            el.style.top = moveN.y + 'px';
          }
          this.renderConnections(unitIndex);
          this.renderMinimap();
        }
        break;
      case 'editNote':
        const editN = unit.notes.find(n => n.id === action.noteId);
        if (editN && action.newData) {
          Object.assign(editN, action.newData);
          const oldEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${action.noteId}"]`);
          if (oldEl) oldEl.remove();
          if (canvas) this.renderNote(editN, canvas, unitIndex);
          requestAnimationFrame(() => {
            this.renderConnections(unitIndex);
            this.renderMinimap();
          });
        }
        break;
      case 'toggleUsed':
      case 'toggleLock':
        // toggle 操作的 redo 和 undo 相同（再执行一次就恢复）
        this._executeUndo(action);
        break;
      case 'addConnection':
        if (action.connectionData) {
          unit.connections.push(action.connectionData);
          this.renderConnections(unitIndex);
        }
        break;
      case 'deleteConnection':
        unit.connections = unit.connections.filter(c => !(c.from === action.from && c.to === action.to));
        this.renderConnections(unitIndex);
        break;
    }
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* ==================== 渲染 ==================== */

  render() {
    this.renderTrack();
    this.renderThumbnails();
    this.updateTrackPosition();
  },

  /* 渲染流程单元轨道 */
  renderTrack() {
    const track = document.getElementById('boardTrack');
    if (!track) return;
    const units = this.getFlowUnits();

    if (units.length === 0) {
      track.innerHTML = `
        <div class="flow-unit">
          <div class="board-empty-state">
            <span class="icon icon-xl"><svg><use href="#i-map"/></svg></span>
            <h3>还没有流程单元</h3>
            <p>点击"新增流程单元"或使用初始化向导开始搭建带团板</p>
            <button class="btn-accent" onclick="BoardManager.showSetupWizard()">
              <span class="icon"><svg><use href="#i-plus"/></svg></span> 初始化向导
            </button>
          </div>
        </div>
      `;
      return;
    }

    let html = '';
    units.forEach((unit, idx) => {
      const isActive = idx === this.currentUnitIndex;
      html += `<div class="flow-unit${isActive ? ' active' : ''}" data-unit-index="${idx}" id="flowUnit_${idx}" style="${isActive ? '' : 'opacity:0;pointer-events:none;'}">`;
      html += `<div class="flow-unit-canvas" id="unitCanvas_${idx}">`;
      html += `<svg class="board-connections" id="unitConnections_${idx}"></svg>`;
      html += `</div>`;
      html += `</div>`;
    });
    track.innerHTML = html;

    units.forEach((unit, idx) => {
      this._updateCanvasTransform(idx);
      this.renderUnitNotes(idx);
      this.renderBackgroundFrames(idx);
      this.renderConnections(idx);
    });

    // 更新标题栏
    this._updateUnitHeader();
    this.renderMinimap();
  },

  /* 渲染指定流程单元的便签 */
  renderUnitNotes(unitIndex) {
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (!canvas) return;
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;

    // 移除旧便签 DOM 和空画布提示（保留 SVG 连线层）
    canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card, .bg-frame, .unit-empty-prompt').forEach(el => el.remove());

    unit.notes.forEach(note => {
      this.renderNote(note, canvas, unitIndex);
    });

    // 渲染战斗部署卡片（只渲染属于当前单元的）
    const battles = this._getBattleDeployments();
    battles.forEach(battle => {
      const bUnit = battle.unitIndex != null ? battle.unitIndex : 0;
      if (bUnit === unitIndex) {
        this._renderBattleDeployCard(battle, unit);
      }
    });

    // 空画布呼吸提示
    const hasContent = canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card, .bg-frame').length > 0;
    if (!hasContent) {
      const prompt = document.createElement('div');
      prompt.className = 'unit-empty-prompt';
      prompt.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>点击右下角的添加便签按钮<br>或点击右上角"数据库"按钮添加数据便签，以开始创作</span>';
      canvas.appendChild(prompt);
    }
  },

  /* 更新空画布提示显隐 */
  _updateEmptyPrompt(unitIndex) {
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (!canvas) return;
    const existingPrompt = canvas.querySelector('.unit-empty-prompt');
    const hasContent = canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card, .bg-frame').length > 0;
    if (hasContent && existingPrompt) {
      existingPrompt.remove();
    } else if (!hasContent && !existingPrompt) {
      const prompt = document.createElement('div');
      prompt.className = 'unit-empty-prompt';
      prompt.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>点击右下角的添加便签按钮<br>或点击右上角"数据库"按钮添加数据便签，以开始创作</span>';
      canvas.appendChild(prompt);
    }
  },

  /* 渲染单个便签 */
  renderNote(note, container, unitIndex) {
    // 纯文本块使用专用渲染
    if (note.type === 'plaintext') {
      this._renderPlainTextBlock(note, container, unitIndex);
      return;
    }
    // 纯文字元素使用专用渲染
    if (note.type === 'text') {
      this._renderTextElement(note, container, unitIndex);
      return;
    }
    // 图片元素使用专用渲染
    if (note.type === 'image') {
      this._renderImageElement(note, container, unitIndex);
      return;
    }

    const el = document.createElement('div');
    el.className = 'note-card' + (note.used ? ' used' : '');
    el.dataset.noteId = note.id;
    el.dataset.type = note.type;

    // 使用虚拟坐标直接定位，画布 CSS transform 负责视口偏移
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
    if (note.width) el.style.width = note.width + 'px';
    if (note.zIndex) el.style.zIndex = note.zIndex;

    const cfg = DatabaseManager.getMergedDbConfig()[note.type];
    const iconId = cfg ? cfg.icon : 'i-folder';
    const typeName = cfg ? cfg.name : note.type;

    // 头部
    let headerHtml = `<div class="note-header">`;
    headerHtml += `<span class="note-type-icon"><svg><use href="#${iconId}"/></svg></span>`;
    headerHtml += `<span class="note-title" title="${this._esc(note.title || '未命名')}">${this._esc(note.title || '未命名')}</span>`;
    headerHtml += `<button class="note-title-edit-btn" title="编辑标题" onclick="event.stopPropagation(); BoardManager.editNoteTitle('${note.id}', ${unitIndex})"><span class="icon"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span></button>`;
    headerHtml += `<span class="type-badge">${this._esc(typeName)}</span>`;
    headerHtml += `<div class="note-actions">`;
    headerHtml += `<button class="check-btn ${note.used ? 'checked' : ''}" title="标记已使用" onclick="event.stopPropagation(); BoardManager.toggleNoteUsed('${note.id}', ${unitIndex})"><span class="icon"><svg><use href="#i-check"/></svg></span></button>`;
    headerHtml += `<button title="复制文本" onclick="event.stopPropagation(); BoardManager.copyNoteText('${note.id}', ${unitIndex})"><span class="icon"><svg viewBox="0 0 24 24" width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span></button>`;
    headerHtml += `<button class="lock-btn ${note.locked ? 'locked' : ''}" title="${note.locked ? '已锁定' : '点击锁定位置'}" onclick="event.stopPropagation(); BoardManager.toggleNoteLock('${note.id}', ${unitIndex})"><span class="icon"><svg><use href="#i-lock"/></svg></span></button>`;
    headerHtml += `<button title="连线" onclick="event.stopPropagation(); BoardManager.startConnection('${note.id}', ${unitIndex})"><span class="icon"><svg><use href="#i-link"/></svg></span></button>`;
    headerHtml += `<button title="删除" onclick="event.stopPropagation(); BoardManager.deleteNote('${note.id}', ${unitIndex})"><span class="icon"><svg><use href="#i-trash"/></svg></span></button>`;
    headerHtml += `</div></div>`;

    // 内容区
    let bodyHtml = '';
    if (note.type === 'characters' && note.characterData) {
      bodyHtml = this._renderCharacterBlock(note.characterData, note);
    } else if ((note.type === 'encounters' || note.type === 'blindbox') && note.diceRanges) {
      bodyHtml = this._renderDiceRanges(note);
    } else {
      bodyHtml = `<div class="note-body">${note.content || ''}</div>`;
    }

    el.innerHTML = headerHtml + bodyHtml;

    // 滚轮事件隔离：当便签内容可滚动时，滚轮只滚动便签内容，不滚动画布
    el.querySelectorAll('.note-body, .dice-ranges, .character-block, .combat-log-entries').forEach(contentEl => {
      contentEl.addEventListener('wheel', (e) => {
        if (contentEl.scrollHeight > contentEl.clientHeight) {
          e.stopPropagation();
        }
      }, { passive: true });
    });

    // 拉伸手柄（右下角）
    el.insertAdjacentHTML('beforeend', `<div class="note-resize-handle" onpointerdown="event.stopPropagation(); BoardManager.startResize(event, '${note.id}', ${unitIndex})"></div>`);

    // 事件绑定
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        // 连线模式下右键退出连线模式
        if (this._waitingForConnectSource || this.isConnecting) {
          this._exitConnectMode();
        }
        return;
      }

      // 连线模式检查（优先于按钮守卫，确保连线模式下按钮不可交互）
      if (this._waitingForConnectSource) {
        this._waitingForConnectSource = false;
        this.startConnection(note.id, unitIndex);
        return;
      }
      if (this.isConnecting && this._connectingUnitIndex === unitIndex) {
        if (this.connectingFrom !== note.id) {
          this.completeConnection(note.id, unitIndex);
        }
        return;
      }

      // 以下守卫仅在非连线模式生效
      if (e.target.closest('.note-actions')) return;
      if (e.target.closest('.combat-panel')) return;
      if (e.target.closest('textarea')) return;
      if (e.target.closest('input')) return;

      // 如果处于擦除模式，不处理拖拽
      if (this._isErasingConnections) return;

      this.startNoteDrag(e, note.id, unitIndex);
    });

    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.note-actions')) return;
      if (e.target.closest('.combat-panel')) return;
      if (e.target.closest('.note-title-edit-btn')) return;
      if (note.locked) return;

      // 双击标题区域：所有类型都进入内联标题编辑
      if (e.target.closest('.note-title')) {
        this.editNoteTitle(note.id, unitIndex);
        return;
      }

      if (note.type === 'characters' && note.characterData) {
        UIRender.switchPage('characters');
        CharAlbum.selectCharacter(note.id);
        return;
      }
      if (note.type === 'plaintext' || note.type === 'text') {
        this.editNote(note.id, unitIndex);
        return;
      }
      if (note.type === 'encounters' || note.type === 'blindbox') {
        this.editNote(note.id, unitIndex);
        return;
      }

      this.editNoteContent(note.id, unitIndex);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waitingForConnectSource || this.isConnecting) {
        this._exitConnectMode();
        return;
      }
      if (this._isErasingConnections) {
        this._exitEraseMode();
        return;
      }
      this.showNoteContextMenu(e, note.id, unitIndex);
    });

    container.appendChild(el);
    // 触发入场弹入动画
    el.classList.add('note-card-entrance');
    el.addEventListener('animationend', () => el.classList.remove('note-card-entrance'), { once: true });
  },

  /* 查找便签对象 */
  _findNoteById(noteId) {
    const units = this.getFlowUnits();
    for (let ui = 0; ui < units.length; ui++) {
      const note = units[ui].notes.find(n => n.id === noteId);
      if (note) return { note, unitIndex: ui };
    }
    return null;
  },

  /* 渲染战斗追踪面板 */
  _renderCombatPanel(note) {
    // COC7角色不使用D&D战斗面板
    if (note.characterData && note.characterData._coc7) return '';
    if (!note.combatTracker) {
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
    }
    const ct = note.combatTracker;
    const maxHp = ct.maxHp || this._parseMaxHp(note.characterData);
    if (maxHp && !ct.maxHp) { ct.maxHp = maxHp; if (ct.currentHp === null) ct.currentHp = maxHp; }
    const cur = ct.currentHp;
    const max = ct.maxHp;
    const tmp = ct.tempHp || 0;
    const pct = (max > 0 && cur !== null) ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    const hpClass = cur === null ? '' : (cur <= 0 ? 'hp-dead' : (pct <= 25 ? 'hp-low' : (pct <= 50 ? 'hp-mid' : 'hp-high')));
    const collapsed = ct._collapsed;

    let h = '<div class="combat-panel">';
    // HP 区域（始终可见）
    h += '<div class="combat-hp-section">';
    h += '<div class="combat-hp-row">';
    h += '<span class="combat-hp-label">HP</span>';
    h += '<div class="combat-hp-bar-wrap"><div class="combat-hp-bar ' + hpClass + '" style="width:' + pct + '%"></div></div>';
    h += '<span class="combat-hp-text">';
    if (cur !== null) {
      h += cur;
      if (tmp > 0) h += '<span class="combat-temp-hp">+' + tmp + '</span>';
      h += ' <span class="hp-max">/ ' + (max || '?') + '</span>';
    } else {
      h += '-- <span class="hp-max">/ ' + (max || '?') + '</span>';
    }
    h += '</span>';
    // 展开/收缩按钮
    h += '<span class="combat-toggle" onclick="event.stopPropagation(); BoardManager.toggleCombatPanel(\'' + note.id + '\')">' + (collapsed ? '▸' : '▾') + '</span>';
    h += '</div>';
    h += '</div>'; // 关闭 combat-hp-section（collapsed/展开共用）

    if (!collapsed) {
      // 控制按钮
      h += '<div class="combat-hp-controls">';
      h += '<div class="combat-hp-step">';
      h += '<button class="combat-step-btn step-dmg" onclick="event.stopPropagation(); var i=document.getElementById(\'combatHpVal_' + note.id + '\'); i.value=Math.max(1,parseInt(i.value||1)-1)" title="数值-1">−</button>';
      h += '<input class="combat-hp-input" type="number" min="1" value="5" id="combatHpVal_' + note.id + '" onclick="event.stopPropagation()">';
      h += '<button class="combat-step-btn step-heal" onclick="event.stopPropagation(); var i=document.getElementById(\'combatHpVal_' + note.id + '\'); i.value=parseInt(i.value||0)+1" title="数值+1">+</button>';
      h += '</div>';
      h += '<button class="combat-hp-quick" onclick="event.stopPropagation(); BoardManager.adjustHPFromInput(\'' + note.id + '\', -1)" title="造成指定伤害">受伤</button>';
      h += '<button class="combat-hp-quick" onclick="event.stopPropagation(); BoardManager.adjustHPFromInput(\'' + note.id + '\', 1)" title="恢复指定生命">治疗</button>';
      h += '<span class="combat-hp-sep"></span>';
      h += '<button class="combat-hp-quick" onclick="event.stopPropagation(); BoardManager.adjustTempHPFromInput(\'' + note.id + '\')" title="添加临时HP（使用左侧数值）">+临HP</button>';
      h += '<button class="combat-reset-btn" onclick="event.stopPropagation(); BoardManager.resetCombatTracker(\'' + note.id + '\')" title="重置战斗追踪">↺ 重置</button>';
      h += '</div>'; // 关闭 combat-hp-controls

      // 状态条件
      h += '<div class="combat-statuses"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><span class="combat-section-label" style="margin-bottom:0;">状态</span>';
      h += '<button class="combat-advance-round" onclick="event.stopPropagation(); BoardManager.advanceOneRound(\'' + note.id + '\')" title="所有状态轮次-1">过一轮</button></div>';
      h += '<div class="combat-status-list">';
      (ct.statuses || []).forEach(function(s, i) {
        const key = BoardManager.STATUS_KEYS[s.name] || 'custom';
        h += '<span class="combat-status-badge status-' + key + '">';
        h += s.name;
        if (s.duration !== null && s.duration !== undefined) {
          h += ' <span class="status-dur-btn" onclick="event.stopPropagation(); BoardManager.adjustStatusDuration(\'' + note.id + '\',' + i + ',-1)">−</span>';
          h += '<span class="status-dur">' + s.duration + (s.unit === 'minutes' ? '分' : '轮') + '</span>';
          h += '<span class="status-dur-btn" onclick="event.stopPropagation(); BoardManager.adjustStatusDuration(\'' + note.id + '\',' + i + ',1)">+</span>';
        } else {
          h += ' <span class="status-dur">永久</span>';
        }
        h += '<span class="status-remove" onclick="event.stopPropagation(); BoardManager.removeStatus(\'' + note.id + '\',' + i + ')">✕</span>';
        h += '</span>';
      });
      h += '<button class="combat-add-status" onclick="event.stopPropagation(); BoardManager.showStatusPicker(\'' + note.id + '\', this)" title="添加状态">+</button>';
      h += '</div></div>';

      // 死亡豁免（仅D&D）
      if (cur !== null && cur <= 0 && SystemManager.getCurrentSystem() === 'dnd5r') {
        const ds = ct.deathSaves || { success: 0, failure: 0 };
        h += '<div class="combat-death-saves">';
        h += '<span class="ds-label">死亡豁免</span>';
        h += '<div class="ds-group"><span class="ds-group-label">成功</span>';
        for (let i = 0; i < 3; i++) {
          h += '<button class="ds-circle ds-success' + (i < ds.success ? ' active' : '') + '" onclick="event.stopPropagation(); BoardManager.toggleDeathSave(\'' + note.id + '\',\'success\',' + i + ')"></button>';
        }
        h += '</div>';
        h += '<div class="ds-group"><span class="ds-group-label">失败</span>';
        for (let i = 0; i < 3; i++) {
          h += '<button class="ds-circle ds-failure' + (i < ds.failure ? ' active' : '') + '" onclick="event.stopPropagation(); BoardManager.toggleDeathSave(\'' + note.id + '\',\'failure\',' + i + ')"></button>';
        }
        h += '</div>';
        h += '<button class="ds-reset" onclick="event.stopPropagation(); BoardManager.resetDeathSaves(\'' + note.id + '\')">重置</button>';
        h += '</div>';
      }

      // 战斗日志
      if (ct.log && ct.log.length > 0) {
        h += '<div class="combat-log">';
        h += '<div class="combat-log-header"><span class="combat-section-label">日志</span>';
        h += '<button class="combat-log-clear" onclick="event.stopPropagation(); BoardManager.clearCombatLog(\'' + note.id + '\')">清空</button></div>';
        h += '<div class="combat-log-entries" onwheel="event.stopPropagation()">';
        ct.log.slice(-20).forEach(function(entry) {
          h += '<div class="combat-log-entry ' + (entry.type ? 'log-' + entry.type : '') + '">';
          h += '<span class="log-time">' + (entry.time || '') + '</span>' + BoardManager._esc(entry.text);
          h += '</div>';
        });
        h += '</div></div>';
      }
    }

    h += '</div>';
    return h;
  },

  /* 从角色HP字段解析最大HP */
  _parseMaxHp(charData) {
    if (!charData) return null;
    // COC格式：hp = {current, max}
    if (charData.hp && typeof charData.hp === 'object' && charData.hp.max != null) {
      return charData.hp.max;
    }
    let hpVal = charData.hp;
    if (!hpVal && charData.fields && charData.fields._hp) hpVal = charData.fields._hp;
    if (!hpVal && charData.fields && charData.fields['HP']) hpVal = charData.fields['HP'];
    if (!hpVal) return null;
    const m = String(hpVal).match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  },

  /* 渲染角色数据块 */
  _renderCharacterBlock(data, note) {
    const sys = SystemManager.getCurrentSystem();
    const hasCocFlag = note && note.characterData && note.characterData._coc7;
    if (sys === 'coc7' || hasCocFlag) {
      return this._renderCocCharacterBlock(data, note);
    }
    if (sys !== 'dnd5r') {
      return this._renderCustomCharacterBlock(data, note);
    }
    const d = data || {};
    let html = '<div class="character-block">';

    // 战斗追踪面板（插在角色数据块顶部）
    if (note) html += this._renderCombatPanel(note);

    // 名称行
    const name = d.name || '未命名角色';
    const enName = d.enName || '';
    html += `<div class="char-name">${this._esc(name)}${enName ? ` <span style="font-size:12px;color:var(--text-muted);font-weight:400;">${this._esc(enName)}</span>` : ''}</div>`;

    // 体型/类型/阵营
    const size = d.size || '';
    const type = d.type || '';
    const alignment = d.alignment || '';
    if (size || type || alignment) {
      html += `<div style="text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:6px;">${this._esc([size, type, alignment].filter(Boolean).join('，'))}</div>`;
    }

    // AC / 先攻 / HP / 速度
    const ac = d.ac || '';
    const initiative = d.initiative || '';
    const hp = d.hp || '';
    const speed = d.speed || '';
    if (ac) html += `<div class="char-stat-row"><span class="char-stat-label">AC</span><span class="char-stat-value">${this._esc(String(ac))}</span></div>`;
    if (initiative) html += `<div class="char-stat-row"><span class="char-stat-label">先攻</span><span class="char-stat-value">${this._esc(String(initiative))}</span></div>`;
    if (hp) html += `<div class="char-stat-row"><span class="char-stat-label">HP</span><span class="char-stat-value">${this._esc(String(hp))}</span></div>`;
    if (speed) html += `<div class="char-stat-row"><span class="char-stat-label">速度</span><span class="char-stat-value">${this._esc(String(speed))}</span></div>`;

    // 六项属性
    const abilities = {
      '力': d.str || '-', '敏': d.dex || '-', '体': d.con || '-',
      '智': d.int || '-', '感': d.wis || '-', '魅': d.cha || '-'
    };
    html += '<div class="char-abilities">';
    for (const [key, val] of Object.entries(abilities)) {
      html += `<div class="char-ability"><div class="ab-name">${key}</div><div class="ab-score">${this._esc(String(val))}</div></div>`;
    }
    html += '</div>';

    // 技能 / 免疫 / 抗性 / 感官 / 语言 / CR
    const skill = d.skill || '';
    const immune = d.immune || '';
    const resistant = d.resistant || '';
    const senses = d.senses || '';
    const languages = d.languages || '';
    const cr = d.cr || '';
    if (skill) html += `<div class="char-stat-row"><span class="char-stat-label">技能</span><span class="char-stat-value">${this._esc(String(skill))}</span></div>`;
    if (immune) html += `<div class="char-stat-row"><span class="char-stat-label">免疫</span><span class="char-stat-value">${this._esc(String(immune))}</span></div>`;
    if (resistant) html += `<div class="char-stat-row"><span class="char-stat-label">抗性</span><span class="char-stat-value">${this._esc(String(resistant))}</span></div>`;
    if (senses) html += `<div class="char-stat-row"><span class="char-stat-label">感官</span><span class="char-stat-value">${this._esc(String(senses))}</span></div>`;
    if (languages) html += `<div class="char-stat-row"><span class="char-stat-label">语言</span><span class="char-stat-value">${this._esc(String(languages))}</span></div>`;
    if (cr) html += `<div class="char-stat-row"><span class="char-stat-label">CR</span><span class="char-stat-value">${this._esc(String(cr))}</span></div>`;

    // 武器
    const fields = d.fields || {};
    let weapons = [];
    try { weapons = JSON.parse(fields['_weapons'] || '[]'); } catch(e) {}
    if (weapons.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">武器</div>`;
      weapons.forEach(w => {
        const parts = [
          `<span style="font-weight:600;">${this._esc(w.name || '')}</span>`,
          w.traits ? this._esc(w.traits) : '',
          w.attack ? this._esc(w.attack) : '',
          w.damage ? this._esc(w.damage) : '',
          w.type ? this._esc(w.type) : ''
        ].filter(Boolean).join(' | ');
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:3px;">${parts}</div>`;
      });
    }

    // 特质
    const traits = d.traits || [];
    if (traits.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">特质</div>`;
      traits.forEach(t => {
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:4px;"><span style="font-weight:600;">${this._esc(t.title || '')}</span>${t.title ? '。' : ''}${this._esc(t.desc || '')}</div>`;
      });
    }

    // 动作
    const actions = d.actions || [];
    if (actions.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">动作</div>`;
      actions.forEach(a => {
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:4px;"><span style="font-weight:600;">${this._esc(a.title || '')}</span>${a.title ? '。' : ''}${this._esc(a.desc || '')}</div>`;
      });
    }

    // 其他
    const other = d.other || '';
    if (other) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">其他</div>`;
      html += `<div style="font-size:11px;line-height:1.5;white-space:pre-wrap;">${this._esc(other)}</div>`;
    }

    // 物品
    let items = [];
    try { items = JSON.parse(fields['_items'] || '[]'); } catch(e) {}
    if (items.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">物品</div>`;
      items.forEach(it => {
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:2px;"><span style="font-weight:600;">${this._esc(it.name || '')}</span>${it.count > 1 ? ' x' + it.count : ''}${it.desc ? ': ' + this._esc(it.desc) : ''}</div>`;
      });
    }

    // 法术
    let spells = [];
    try { spells = JSON.parse(fields['_spells'] || '[]'); } catch(e) {}
    if (spells.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">法术</div>`;
      spells.forEach(sp => {
        const levelLabel = sp.level === 0 ? '戏法' : sp.level + '环';
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:2px;"><span style="font-weight:600;">${this._esc(sp.name || '')}</span> <span style="color:var(--accent);font-size:10px;">${levelLabel} · ${this._esc(sp.school || '')}</span></div>`;
      });
    }

    html += '</div>';
    return html;
  },

  /** COC角色便签块（带团板画布） */
  _renderCocCharacterBlock(data, note) {
    const d = data || {};
    const esc = (v) => this._esc(v != null ? v : '');
    const attrs = d.attributes || {};
    const hp = d.hp || {}, san = d.san || {}, luck = d.luck || {}, mp = d.mp || {};
    const dbInfo = _cocCalcDB(attrs.str?.value, attrs.siz?.value);
    const weapons = d.weapons || [];
    const inventory = d.inventory || [];
    const insanity = d.insanityEffects || [];

    let html = '<div class="character-block coc-board-block">';
    if (note) html += this._renderCombatPanel(note);

    // 名称 + 职业
    const metaParts = [d.occupation, d.age ? d.age + '岁' : ''].filter(Boolean);
    html += `<div class="coc-bb-header">`;
    html += `<span class="coc-bb-name">${esc(d.name || '未命名')}</span>`;
    if (metaParts.length) html += `<span class="coc-bb-meta">${metaParts.map(m => esc(m)).join(' · ')}</span>`;
    if (d.player) html += `<span class="coc-bb-player">玩家: ${esc(d.player)}</span>`;
    html += '</div>';

    // 核心数值条
    html += '<div class="coc-bb-derived">';
    const dItems = [
      { label: 'HP', cur: hp.current, max: hp.max, color: 'coc-bb-hp' },
      { label: 'SAN', cur: san.current, max: san.max, color: 'coc-bb-san' },
      { label: 'LUCK', cur: luck.current, max: luck.max || 99, color: 'coc-bb-luck' },
      { label: 'MP', cur: mp.current, max: mp.max, color: 'coc-bb-mp' }
    ];
    dItems.forEach(di => {
      html += `<div class="coc-bb-stat ${di.color}">`;
      html += `<span class="coc-bb-stat-label">${di.label}</span>`;
      html += `<span class="coc-bb-stat-val">${di.cur != null ? di.cur : '--'}<span class="coc-bb-stat-max">/${di.max != null ? di.max : '--'}</span></span>`;
      if (di.max > 0 && di.label !== 'LUCK') {
        const pct = Math.min(100, Math.max(0, (di.cur || 0) / di.max * 100));
        const cls = pct <= 25 ? 'coc-bb-bar-danger' : pct <= 50 ? 'coc-bb-bar-low' : '';
        html += `<div class="coc-bb-bar"><div class="coc-bb-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
      }
      html += '</div>';
    });
    html += `<div class="coc-bb-stat coc-bb-db"><span class="coc-bb-stat-label">DB</span><span class="coc-bb-stat-val">${esc(dbInfo.db)}</span></div>`;
    html += '</div>';

    // 八大属性 4x2
    html += '<div class="coc-bb-attrs">';
    for (const [key, attr] of Object.entries(attrs)) {
      const v = attr.value || 0;
      html += `<div class="coc-bb-attr">`;
      html += `<span class="coc-bb-attr-label">${esc(attr.name)}</span>`;
      html += `<span class="coc-bb-attr-val">${v}</span>`;
      html += `<span class="coc-bb-attr-half">${Math.floor(v / 2)}</span>`;
      html += '</div>';
    }
    html += '</div>';

    // 武器
    if (weapons.length > 0) {
      html += '<div class="coc-bb-section"><div class="coc-bb-section-label">武器</div>';
      weapons.forEach(w => {
        html += `<div class="coc-bb-weapon">`;
        html += `<span class="coc-bb-weapon-name">${esc(w.name || '')}</span>`;
        html += `<span class="coc-bb-weapon-rate">${w.rate != null ? w.rate + '%' : ''}</span>`;
        html += `<span class="coc-bb-weapon-dmg">${esc(w.damage || '')}</span>`;
        html += '</div>';
      });
      html += '</div>';
    }

    // 物品
    if (inventory.length > 0) {
      html += '<div class="coc-bb-section"><div class="coc-bb-section-label">物品</div>';
      html += '<div class="coc-bb-inv-list">';
      inventory.slice(0, 8).forEach(item => {
        html += `<span class="coc-bb-inv-item">${item.location ? '<span class="coc-bb-inv-loc">' + esc(item.location) + '</span> ' : ''}${esc(item.name || '')}</span>`;
      });
      if (inventory.length > 8) html += `<span class="coc-bb-inv-more">+${inventory.length - 8} 件</span>`;
      html += '</div></div>';
    }

    // 疯狂效果
    if (insanity.length > 0) {
      html += '<div class="coc-bb-section"><div class="coc-bb-section-label coc-bb-insanity-label">疯狂</div>';
      insanity.forEach(eff => {
        html += `<div class="coc-bb-insanity">${esc(eff.name)}</div>`;
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  _renderCustomCharacterBlock(data, note) {
    const d = data || {};
    const f = d.fields || {};
    const tpl = CharTemplateManager.getTemplate();

    let html = '<div class="character-block">';
    if (note) html += this._renderCombatPanel(note);

    const name = f._name || d.name || (note ? note.title : '') || '未命名';
    const faction = f._faction || d.faction || 'friendly_npc';
    const hp = f._hp || d.hp || '';
    const props = f._props || {};
    const sections = f._sections || {};

    const factionMap = { pc: '玩家角色', friendly_npc: '友方NPC', enemy_npc: '敌方NPC' };
    const factionColor = { pc: '#4CAF50', friendly_npc: '#2196F3', enemy_npc: '#f44336' };

    html += `<div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:6px;display:flex;align-items:center;gap:6px;">`;
    html += `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${factionColor[faction] || '#999'}22;color:${factionColor[faction] || '#999'};">${factionMap[faction] || faction}</span>`;
    html += `<span>${this._esc(name)}</span>`;
    html += `</div>`;

    if (hp) {
      html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">HP: <span style="color:var(--text);font-weight:600;">${this._esc(hp)}</span></div>`;
    }

    if (tpl.properties.length > 0) {
      html += '<div class="char-props-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(52px, 1fr));gap:4px;margin-bottom:8px;">';
      tpl.properties.forEach(prop => {
        const val = props[prop.id] || '';
        html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px;text-align:center;">`;
        html += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:2px;">${this._esc(prop.name)}</div>`;
        html += `<div style="font-size:12px;font-weight:700;color:var(--text);">${this._esc(val) || '--'}</div>`;
        html += `</div>`;
      });
      html += '</div>';
    }

    tpl.sections.forEach(sec => {
      const items = sections[sec.id] || [];
      if (items.length === 0) return;
      html += `<div style="margin-top:6px;">`;
      html += `<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:3px;display:flex;align-items:center;gap:4px;">`;
      html += `<svg width="10" height="10" style="fill:var(--accent);"><use href="#${sec.icon}"/></svg>`;
      html += `${this._esc(sec.name)} (${items.length})</div>`;
      html += `<div style="font-size:11px;line-height:1.5;">`;
      items.forEach(it => {
        html += `<div style="margin-bottom:2px;"><span style="font-weight:600;color:var(--text);">${this._esc(it.name || '')}</span>`;
        if (it.desc) html += `: <span style="color:var(--text-muted);">${this._esc(it.desc)}</span>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    });

    // 物品
    let customItems = [];
    try { customItems = JSON.parse(f['_items'] || '[]'); } catch(e) {}
    if (customItems.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">物品</div>`;
      customItems.forEach(it => {
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:2px;"><span style="font-weight:600;">${this._esc(it.name || '')}</span>${it.count > 1 ? ' x' + it.count : ''}${it.desc ? ': ' + this._esc(it.desc) : ''}</div>`;
      });
    }

    // 法术
    let customSpells = [];
    try { customSpells = JSON.parse(f['_spells'] || '[]'); } catch(e) {}
    if (customSpells.length > 0) {
      html += `<div style="font-weight:700;font-size:12px;color:var(--text);margin-top:8px;margin-bottom:4px;border-top:1px solid var(--border);padding-top:6px;">法术</div>`;
      customSpells.forEach(sp => {
        const levelLabel = sp.level === 0 ? '戏法' : sp.level + '环';
        html += `<div style="font-size:11px;line-height:1.5;margin-bottom:2px;"><span style="font-weight:600;">${this._esc(sp.name || '')}</span> <span style="color:var(--accent);font-size:10px;">${levelLabel} · ${this._esc(sp.school || '')}</span></div>`;
      });
    }

    html += '</div>';
    return html;
  },

  /* ═══ 战斗追踪交互方法 ═══ */

  /* 调整HP（±增量） */
  adjustHP(noteId, delta) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct || ct.currentHp === null) return;
    const oldHp = ct.currentHp;
    // 临时HP吸收伤害逻辑
    if (delta < 0 && ct.tempHp > 0) {
      const totalDmg = Math.abs(delta);
      const absorbed = Math.min(ct.tempHp, totalDmg);
      ct.tempHp -= absorbed;
      const remaining = totalDmg - absorbed;
      ct.currentHp = Math.max(0, ct.currentHp - remaining);
    } else {
      ct.currentHp = Math.max(0, Math.min(ct.maxHp || 9999, ct.currentHp + delta));
    }
    if (ct.currentHp === oldHp && delta > 0) return;
    const actual = ct.currentHp - oldHp;
    this._addCombatLog(ct, actual > 0 ? '恢复 ' + actual + ' 点生命' : '受到 ' + Math.abs(oldHp - ct.currentHp) + ' 点伤害' + (ct.tempHp < (found.note.combatTracker._prevTempHp || 0) ? '（临时HP吸收）' : ''), actual > 0 ? 'heal' : 'damage');
    found.note.combatTracker._prevTempHp = ct.tempHp;
    if (ct.currentHp <= 0 && oldHp > 0) this._addCombatLog(ct, '生命值降至0，进入濒死状态', 'death');
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this._updateCardHpVisual(noteId, ct);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 从输入框调整HP */
  adjustHPFromInput(noteId, sign) {
    const input = document.getElementById('combatHpVal_' + noteId);
    if (!input) return;
    const val = parseInt(input.value) || 0;
    if (val <= 0) return;
    this.adjustHP(noteId, sign * val);
  },

  /* 从输入框添加临时HP */
  adjustTempHPFromInput(noteId) {
    const input = document.getElementById('combatHpVal_' + noteId);
    if (!input) return;
    const val = parseInt(input.value) || 0;
    if (val <= 0) return;
    this.adjustTempHP(noteId, val);
  },

  /* 调整临时HP */
  adjustTempHP(noteId, delta) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    ct.tempHp = Math.max(0, (ct.tempHp || 0) + delta);
    this._addCombatLog(ct, delta > 0 ? '获得 ' + delta + ' 点临时HP' : '临时HP减少 ' + Math.abs(delta), delta > 0 ? 'heal' : 'damage');
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 添加状态 */
  addStatus(noteId, name, duration, unit) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    if (!ct.statuses) ct.statuses = [];
    // 同种状态叠加：检查是否已有同名状态
    const existing = ct.statuses.find(s => s.name === name);
    if (existing) {
      if (existing.duration === null || duration === null) {
        existing.duration = null; // 任一是永久则结果为永久
      } else {
        existing.duration += duration;
      }
      this._addCombatLog(ct, '状态叠加：' + name + '（+' + (duration || '∞') + '）', 'status');
    } else {
      ct.statuses.push({ name: name, duration: duration, unit: unit || 'rounds' });
      this._addCombatLog(ct, '获得状态：' + name + (duration ? '（' + duration + (unit === 'minutes' ? '分钟' : '轮') + '）' : '（永久）'), 'status');
    }
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 移除状态 */
  removeStatus(noteId, index) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct || !ct.statuses || !ct.statuses[index]) return;
    const name = ct.statuses[index].name;
    ct.statuses.splice(index, 1);
    this._addCombatLog(ct, '移除状态：' + name, 'status');
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 调整状态持续时间 */
  adjustStatusDuration(noteId, index, delta) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct || !ct.statuses || !ct.statuses[index]) return;
    const s = ct.statuses[index];
    if (s.duration === null || s.duration === undefined) return;
    s.duration = Math.max(0, s.duration + delta);
    if (s.duration === 0) {
      this.removeStatus(noteId, index);
      return;
    }
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 过一轮：所有轮次状态-1，到期移除 */
  advanceOneRound(noteId) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct || !ct.statuses) return;
    const expired = [];
    ct.statuses.forEach(function(s) {
      if (s.duration !== null && s.duration !== undefined && s.unit !== 'minutes') {
        s.duration -= 1;
        if (s.duration <= 0) expired.push(s.name);
      }
    });
    ct.statuses = ct.statuses.filter(function(s) {
      return s.duration === null || s.duration === undefined || s.duration > 0;
    });
    if (expired.length > 0) {
      this._addCombatLog(ct, '状态过期：' + expired.join('、'), 'status');
    }
    this._addCombatLog(ct, '过了一轮', 'status');
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this._updateCardHpVisual(noteId, ct);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 切换死亡豁免 */
  toggleDeathSave(noteId, type, index) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    if (!ct.deathSaves) ct.deathSaves = { success: 0, failure: 0 };
    const ds = ct.deathSaves;
    if (type === 'success') {
      ds.success = ds.success === index + 1 ? index : index + 1;
      if (ds.success >= 3) this._addCombatLog(ct, '死亡豁免成功3次，角色稳定！', 'heal');
    } else {
      ds.failure = ds.failure === index + 1 ? index : index + 1;
      if (ds.failure >= 3) this._addCombatLog(ct, '死亡豁免失败3次，角色死亡！', 'death');
    }
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 重置死亡豁免 */
  resetDeathSaves(noteId) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    ct.deathSaves = { success: 0, failure: 0 };
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 折叠/展开战斗面板 */
  toggleCombatPanel(noteId) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    ct._collapsed = !ct._collapsed;
    this._rerenderCombatPanel(noteId, found.unitIndex);
  },

  /* 重置战斗追踪 */
  resetCombatTracker(noteId) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const note = found.note;
    const maxHp = note.combatTracker ? note.combatTracker.maxHp : null;
    note.combatTracker = {
      currentHp: maxHp || this._parseMaxHp(note.characterData),
      maxHp: maxHp || this._parseMaxHp(note.characterData),
      tempHp: 0, statuses: [],
      deathSaves: { success: 0, failure: 0 },
      log: [], _collapsed: false
    };
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this._updateCardHpVisual(noteId, note.combatTracker);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 清空战斗日志 */
  clearCombatLog(noteId) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const ct = found.note.combatTracker;
    if (!ct) return;
    ct.log = [];
    this._rerenderCombatPanel(noteId, found.unitIndex);
    this.saveBoard(); StorageManager.scheduleSave();
  },

  /* 显示状态选择器 */
  showStatusPicker(noteId, btnEl) {
    this.hideStatusPicker();
    const rect = btnEl.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.className = 'combat-status-picker';
    picker.id = 'combatStatusPicker';
    picker.style.left = rect.left + 'px';
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.onclick = function(e) { e.stopPropagation(); };

    let h = '<div class="status-picker-grid">';
    this.STATUS_PRESETS.forEach(function(name) {
      const key = BoardManager.STATUS_KEYS[name] || 'custom';
      h += '<div class="status-picker-item status-' + key + '" onclick="event.stopPropagation(); BoardManager._pickStatus(\'' + noteId + '\',\'' + name + '\')">' + name + '</div>';
    });
    h += '</div>';
    h += '<div class="status-picker-dur-row">';
    h += '<span>时长</span>';
    h += '<input type="number" min="0" value="3" id="statusDurInput_' + noteId + '" onclick="event.stopPropagation()" style="width:42px">';
    h += '<select id="statusDurUnit_' + noteId + '" onclick="event.stopPropagation()" style="width:48px">';
    h += '<option value="rounds">轮</option><option value="minutes">分钟</option><option value="permanent">永久</option>';
    h += '</select></div>';
    h += '<div class="status-picker-custom">';
    h += '<input type="text" placeholder="自定义状态..." id="statusCustomInput_' + noteId + '" onclick="event.stopPropagation()">';
    h += '<button onclick="event.stopPropagation(); BoardManager._pickCustomStatus(\'' + noteId + '\')">添加</button>';
    h += '</div>';
    picker.innerHTML = h;
    document.body.appendChild(picker);

    setTimeout(function() {
      document.addEventListener('click', BoardManager._pickerOutsideClickHandler = function(e) {
        if (!e.target.closest('.combat-status-picker')) BoardManager.hideStatusPicker();
      });
    }, 10);
  },

  _pickStatus(noteId, name) {
    const durEl = document.getElementById('statusDurInput_' + noteId);
    const unitEl = document.getElementById('statusDurUnit_' + noteId);
    let duration = durEl ? parseInt(durEl.value) : 3;
    let unit = unitEl ? unitEl.value : 'rounds';
    if (unit === 'permanent' || isNaN(duration) || duration < 0) { duration = null; unit = 'rounds'; }
    this.addStatus(noteId, name, duration, unit);
    this.hideStatusPicker();
  },

  _pickCustomStatus(noteId) {
    const input = document.getElementById('statusCustomInput_' + noteId);
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    this._pickStatus(noteId, name);
  },

  hideStatusPicker() {
    const picker = document.getElementById('combatStatusPicker');
    if (picker) picker.remove();
    if (this._pickerOutsideClickHandler) {
      document.removeEventListener('click', this._pickerOutsideClickHandler);
      this._pickerOutsideClickHandler = null;
    }
  },

  /* 获取世界时钟格式化时间 */
  _getWorldClockTime() {
    if (typeof WorldClock !== 'undefined') {
      const data = WorldClock._getData();
      const totalMin = data.time || 0;
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    const now = new Date();
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  },

  /* 添加战斗日志条目 */
  _addCombatLog(ct, text, type) {
    if (!ct.log) ct.log = [];
    ct.log.push({ text: text, type: type || '', time: this._getWorldClockTime() });
    if (ct.log.length > 50) ct.log = ct.log.slice(-50);
  },

  /* 重新渲染战斗面板（局部更新） */
  _rerenderCombatPanel(noteId, unitIndex) {
    const found = this._findNoteById(noteId);
    if (!found) return;
    const note = found.note;
    const card = document.querySelector('#unitCanvas_' + unitIndex + ' .note-card[data-note-id="' + noteId + '"]');
    if (!card) return;
    const oldPanel = card.querySelector('.combat-panel');
    const charBlock = card.querySelector('.character-block');
    if (!charBlock) return;
    const newHtml = this._renderCombatPanel(note);
    if (oldPanel) {
      oldPanel.outerHTML = newHtml;
    } else {
      charBlock.insertAdjacentHTML('afterbegin', newHtml);
    }
  },

  /* 更新卡片HP视觉反馈 */
  _updateCardHpVisual(noteId, ct) {
    const card = document.querySelector('[data-note-id="' + noteId + '"]');
    if (!card) return;
    card.classList.remove('hp-critical', 'hp-dead');
    if (ct.currentHp !== null && ct.maxHp > 0) {
      const pct = (ct.currentHp / ct.maxHp) * 100;
      if (ct.currentHp <= 0) card.classList.add('hp-dead');
      else if (pct <= 25) card.classList.add('hp-critical');
    }
  },

  /* 渲染随机遭遇/盲盒范围 */
  _renderDiceRanges(note) {
    const dr = note.diceRanges;
    if (!dr) return '<div class="dice-ranges" style="padding:8px;color:var(--text-muted);font-size:12px;">暂无范围数据</div>';

    // 判断新旧格式：新格式是 {dieType, headers, ranges}，旧格式是数组
    const isNewFormat = !Array.isArray(dr) && dr.ranges;
    const ranges = isNewFormat ? dr.ranges : dr;
    const dieType = isNewFormat ? (dr.dieType || 'd20') : 'd20';
    const headers = isNewFormat ? (dr.headers || []) : [];

    if (ranges.length === 0) {
      return '<div class="dice-ranges" style="padding:8px;color:var(--text-muted);font-size:12px;">暂无范围数据</div>';
    }

    // 盲盒新格式：卡片列表样式
    if (note.type === 'blindbox' && isNewFormat) {
      let html = '<div class="dice-ranges bx-card-list">';
      // 骰子类型标题
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border);">`;
      html += `<span style="font-size:13px;font-weight:600;color:var(--accent);">${this._esc(dieType.toUpperCase())}</span>`;
      if (headers.length > 0) {
        html += `<span style="font-size:11px;color:var(--text-muted);">${this._esc(headers.join(' / '))}</span>`;
      }
      html += `</div>`;
      // 卡片列表
      ranges.forEach((range, idx) => {
        const rangeLabel = range.min === range.max ? `${range.min}` : `${range.min}~${range.max}`;
        html += `<div class="bx-card" data-range-idx="${idx}" style="display:flex;gap:8px;padding:6px 8px;margin-bottom:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;align-items:flex-start;">`;
        html += `<span class="bx-card-num" style="flex-shrink:0;min-width:36px;height:24px;line-height:24px;text-align:center;background:var(--accent);color:#fff;border-radius:4px;font-size:12px;font-weight:600;">${this._esc(rangeLabel)}</span>`;
        html += `<span class="bx-card-text" style="flex:1;font-size:12px;color:var(--text);line-height:1.5;word-break:break-word;">${this._esc(range.content || '')}</span>`;
        html += `</div>`;
      });
      html += `<button style="margin-top:4px;padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;width:100%;" onclick="BoardManager.addDiceRange('${note.id}')">+ 添加范围</button>`;
      html += '</div>';
      return html;
    }

    // 遭遇旧格式：折叠列表样式
    let html = '<div class="dice-ranges">';
    ranges.forEach((range, idx) => {
      const expanded = range._expanded ? ' expanded' : '';
      html += `<div class="dice-range${expanded}" data-range-idx="${idx}">`;
      html += `<div class="dice-range-header" onclick="BoardManager.toggleDiceRange('${note.id}', ${idx})">`;
      html += `<span class="range-arrow"><svg width="12" height="12"><use href="#i-chevron-r"/></svg></span>`;
      html += `<span class="range-label">d${range.min}-${range.max}</span>`;
      html += `</div>`;
      html += `<div class="dice-range-content">`;
      html += `<textarea placeholder="输入内容..." oninput="BoardManager.updateDiceRangeContent('${note.id}', ${idx}, this.value)">${this._esc(range.content || '')}</textarea>`;
      html += `</div></div>`;
    });
    html += `<button style="margin-top:4px;padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;width:100%;" onclick="BoardManager.addDiceRange('${note.id}')">+ 添加范围</button>`;
    html += '</div>';
    return html;
  },

  /* 渲染连线 */
  renderConnections(unitIndex) {
    const svg = document.getElementById('unitConnections_' + unitIndex);
    if (!svg) return;
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;

    let svgHtml = '';

    // 定义箭头标记和发光滤镜
    svgHtml += `<defs>`;
    svgHtml += `<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)"/></marker>`;
    svgHtml += `<filter id="glow"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    svgHtml += `</defs>`;

    unit.connections.forEach((conn, idx) => {
      const fromNote = unit.notes.find(n => n.id === conn.from) || this._getBattle(conn.from);
      const toNote = unit.notes.find(n => n.id === conn.to) || this._getBattle(conn.to);
      if (!fromNote || !toNote) return;

      // 获取实际 DOM 尺寸和位置
      const fromEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${conn.from}"]`);
      const toEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${conn.to}"]`);

      let fx, fy, tx, ty;
      if (fromEl) {
        fx = fromEl.offsetLeft + fromEl.offsetWidth / 2;
        fy = fromEl.offsetTop + fromEl.offsetHeight / 2;
      } else {
        fx = fromNote.x + 100;
        fy = fromNote.y + 50;
      }
      if (toEl) {
        tx = toEl.offsetLeft + toEl.offsetWidth / 2;
        ty = toEl.offsetTop + toEl.offsetHeight / 2;
      } else {
        tx = toNote.x + 100;
        ty = toNote.y + 50;
      }

      const color = conn.color || '#c0ab84';

      // 检测端点是否为纯文字元素，若是则该端透明度渐变为0
      const fromIsText = fromNote && fromNote.type === 'text';
      const toIsText = toNote && toNote.type === 'text';
      let strokeAttr = `stroke="${color}"`;

      if (fromIsText || toIsText) {
        const gid = `connGrad_${unitIndex}_${idx}`;
        let gradHtml = `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}">`;
        if (fromIsText) {
          gradHtml += `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>`;
          gradHtml += `<stop offset="30%" stop-color="${color}" stop-opacity="1"/>`;
        } else {
          gradHtml += `<stop offset="0%" stop-color="${color}" stop-opacity="1"/>`;
        }
        if (toIsText) {
          gradHtml += `<stop offset="70%" stop-color="${color}" stop-opacity="1"/>`;
          gradHtml += `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>`;
        } else {
          gradHtml += `<stop offset="100%" stop-color="${color}" stop-opacity="1"/>`;
        }
        gradHtml += `</linearGradient>`;
        svgHtml += `<defs>${gradHtml}</defs>`;
        strokeAttr = `stroke="url(#${gid})"`;
      }

      // 发光层
      svgHtml += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" ${strokeAttr} stroke-width="3" stroke-linecap="round" filter="url(#glow)" opacity="0.15"/>`;
      // 主连线
      svgHtml += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" ${strokeAttr} stroke-width="2" stroke-linecap="round" opacity="0.5" class="connection-line" data-conn-idx="${idx}" onclick="BoardManager._onConnectionClick(${unitIndex}, ${idx})" style="pointer-events:stroke;"/>`;
      // 流动虚线层
      svgHtml += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" ${strokeAttr} stroke-width="1.5" stroke-linecap="round" opacity="0.12" class="connection-flow-line" style="pointer-events:none;"/>`;

      // 流动动画点
      svgHtml += `<circle r="3" fill="${color}" opacity="0.8"><animateMotion dur="1.5s" repeatCount="indefinite" path="M${fx},${fy} L${tx},${ty}"/></circle>`;
    });

    svg.innerHTML = svgHtml;
  },

  /* 渲染缩略图导航条 */
  renderThumbnails() {
    const container = document.getElementById('boardThumbnails');
    if (!container) return;
    const units = this.getFlowUnits();

    if (units.length === 0) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">暂无流程单元</span>';
      return;
    }

    let html = '';
    units.forEach((unit, idx) => {
      const active = idx === this.currentUnitIndex ? ' active' : '';
      html += `<div class="thumbnail-item${active}" data-thumb-index="${idx}" onmousedown="BoardManager._thumbDragStart(event, ${idx})" title="${this._esc(unit.title || '未命名')}">`;
      html += `${idx + 1}. ${this._esc(unit.title || '未命名')}`;
      html += `</div>`;
    });
    container.innerHTML = html;

    // 自动滚动到当前活跃单元可见
    requestAnimationFrame(() => {
      const activeThumb = container.querySelector('.thumbnail-item.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  },

  /* ==================== 缩略图拖拽排序 ==================== */

  _thumbDragState: null,
  _thumbDragMoveBound: null,
  _thumbDragEndBound: null,

  _thumbDragStart(e, idx) {
    // 只响应左键
    if (e.button !== 0) return;
    e.preventDefault();

    const container = document.getElementById('boardThumbnails');
    const items = container ? container.querySelectorAll('.thumbnail-item') : [];
    const targetItem = items[idx];
    if (!targetItem) return;

    this._thumbDragState = {
      startIdx: idx,
      currentIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      container: container,
      items: Array.from(items),
      itemWidth: targetItem.offsetWidth,
    };

    this._thumbDragMoveBound = (e) => this._thumbDragMove(e);
    this._thumbDragEndBound = (e) => this._thumbDragEnd(e);

    document.addEventListener('mousemove', this._thumbDragMoveBound);
    document.addEventListener('mouseup', this._thumbDragEndBound);
  },

  _thumbDragMove(e) {
    const state = this._thumbDragState;
    if (!state) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    // 未达到拖拽阈值，不启动
    if (!state.dragging) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      state.dragging = true;
      // 标记拖拽中的元素
      const dragEl = state.items[state.startIdx];
      if (dragEl) dragEl.classList.add('thumb-dragging');
      state.container.classList.add('thumb-drag-active');
    }

    // 计算鼠标在哪个标签上
    const items = state.items;
    let targetIdx = state.currentIdx;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        targetIdx = i;
        break;
      }
      targetIdx = i;
    }

    if (targetIdx !== state.currentIdx) {
      // 交换 flowUnits 数组中的元素
      const units = this.getFlowUnits();
      const fromIdx = state.currentIdx;
      const toIdx = targetIdx;
      const [moved] = units.splice(fromIdx, 1);
      units.splice(toIdx, 0, moved);

      // 更新 currentUnitIndex：如果拖的是当前活跃单元，跟着走
      if (this.currentUnitIndex === fromIdx) {
        this.currentUnitIndex = toIdx;
      } else if (fromIdx < this.currentUnitIndex && toIdx >= this.currentUnitIndex) {
        this.currentUnitIndex--;
      } else if (fromIdx > this.currentUnitIndex && toIdx <= this.currentUnitIndex) {
        this.currentUnitIndex++;
      }

      state.currentIdx = toIdx;

      // 重新渲染标签栏（保持拖拽状态）
      this._renderThumbnailsDuringDrag();
    }
  },

  _thumbDragEnd(e) {
    const state = this._thumbDragState;
    if (!state) return;

    document.removeEventListener('mousemove', this._thumbDragMoveBound);
    document.removeEventListener('mouseup', this._thumbDragEndBound);

    if (state.dragging) {
      // 拖拽结束，保存并完整重渲染
      const container = state.container;
      if (container) container.classList.remove('thumb-drag-active');
      this.saveBoard();
      this.renderTrack();          // 重建 DOM，使 .flow-unit 顺序与新数组一致
      this.renderThumbnails();
      this.goToUnit(this.currentUnitIndex);
    } else {
      // 没有拖拽，当作点击处理
      this.goToUnit(state.startIdx);
    }

    this._thumbDragState = null;
  },

  /* 拖拽过程中的轻量重渲染：只更新标签顺序，不触发滚动 */
  _renderThumbnailsDuringDrag() {
    const state = this._thumbDragState;
    if (!state) return;
    const container = state.container;
    if (!container) return;
    const units = this.getFlowUnits();

    let html = '';
    units.forEach((unit, idx) => {
      const active = idx === this.currentUnitIndex ? ' active' : '';
      const dragging = idx === state.currentIdx ? ' thumb-dragging' : '';
      html += `<div class="thumbnail-item${active}${dragging}" data-thumb-index="${idx}" title="${this._esc(unit.title || '未命名')}">`;
      html += `${idx + 1}. ${this._esc(unit.title || '未命名')}`;
      html += `</div>`;
    });
    container.innerHTML = html;

    // 更新 state.items 引用
    state.items = Array.from(container.querySelectorAll('.thumbnail-item'));
  },

  /* ==================== 导航 ==================== */

  goToUnit(index) {
    const units = this.getFlowUnits();
    if (index < 0 || index >= units.length) return;

    // 退出便签编辑状态
    this._exitNoteEdit();

    // 保存当前单元的视口状态
    const currentUnit = units[this.currentUnitIndex];
    if (currentUnit) {
      currentUnit.viewport = { x: this.viewport.x, y: this.viewport.y, scale: this.scale };
    }

    this.currentUnitIndex = index;

    // 加载新单元的视口状态
    const newUnit = units[index];
    if (newUnit && newUnit.viewport) {
      this.viewport = { x: newUnit.viewport.x, y: newUnit.viewport.y };
      this.scale = newUnit.viewport.scale || 1;
    } else {
      this.viewport = { x: 0, y: 0 };
      this.scale = 1;
    }

    // 更新流程单元可见性（使用 opacity 实现交叉淡入淡出）
    document.querySelectorAll('.flow-unit').forEach((el, i) => {
      if (i === index) {
        el.classList.add('active');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      } else {
        el.classList.remove('active');
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    });
    this.updateTrackPosition();
    this.renderThumbnails();
    this._updateCanvasTransform();
    this._updateUnitHeader();
    this.renderMinimap();

    // 如果数据库面板打开，刷新条目灰显
    if (this._dbPanelOpen && this._currentDbKey) {
      this.renderDbEntries(this._currentDbKey);
    }
  },

  nextUnit() {
    const units = this.getFlowUnits();
    if (this.currentUnitIndex < units.length - 1) {
      this.goToUnit(this.currentUnitIndex + 1);
    }
  },

  prevUnit() {
    if (this.currentUnitIndex > 0) {
      this.goToUnit(this.currentUnitIndex - 1);
    }
  },

  /* 更新轨道位置 */
  updateTrackPosition() {
    const track = document.getElementById('boardTrack');
    if (!track) return;
    track.style.transform = `translateX(-${this.currentUnitIndex * 100}%)`;
  },

  /* ==================== 流程单元管理 ==================== */

  addFlowUnit() {
    const board = this.getBoard();
    if (!board) return;

    const title = '新流程单元 ' + (board.flowUnits.length + 1);
    const newUnit = {
      id: AppState.generateUUID(),
      title: title,
      description: '流程备注',
      sourceEntryId: null,
      notes: [],
      connections: [],
      backgroundFrames: [],
      viewport: { x: 0, y: 0, scale: 1 }
    };
    board.flowUnits.push(newUnit);
    this.currentUnitIndex = board.flowUnits.length - 1;
    this.render();
    this.saveBoard();
    StorageManager.scheduleSave();
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('flowUnitCreated', { title });
    }
  },

  /* 编辑流程单元标题（双击） */
  editUnitTitle(unitIndex, h2El) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit || !h2El) return;

    // 替换 h2 为 input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'flow-unit-title-input';
    input.value = unit.title || '';
    input.addEventListener('blur', () => {
      unit.title = input.value || '未命名单元';
      this.render();
      this.saveBoard();
      StorageManager.scheduleSave();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = unit.title; input.blur(); }
    });
    h2El.replaceWith(input);
    input.focus();
    input.select();
  },

  /* 编辑流程单元描述（双击） */
  editUnitDesc(unitIndex, pEl) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit || !pEl) return;

    // 替换 p 为 input
    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'border:1px solid var(--accent);border-radius:4px;padding:2px 8px;font-size:13px;color:var(--text-muted);outline:none;background:var(--card);text-align:center;min-width:200px;';
    input.value = unit.description || '';
    input.placeholder = '输入描述...';
    input.addEventListener('blur', () => {
      unit.description = input.value || '';
      this.render();
      this.saveBoard();
      StorageManager.scheduleSave();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = unit.description; input.blur(); }
    });
    pEl.replaceWith(input);
    input.focus();
    input.select();
  },

  deleteFlowUnit(index) {
    const board = this.getBoard();
    if (!board || board.flowUnits.length <= 1) return;

    App.showConfirm('删除流程单元', `确定要删除「${board.flowUnits[index].title}」吗？其中的便签也会被删除。`, '删除', () => {
      board.flowUnits.splice(index, 1);
      if (this.currentUnitIndex >= board.flowUnits.length) {
        this.currentUnitIndex = board.flowUnits.length - 1;
      }
      this._rebuildPlacedIds();
      this.render();
      this.saveBoard();
      StorageManager.scheduleSave();
    });
  },

  /* ==================== 初始化向导 ==================== */

  showSetupWizard() {
    const wizard = document.getElementById('boardSetupWizard');
    const box = document.getElementById('wizardBox');
    if (!wizard || !box) return;

    const mod = AppState.currentModule;
    const sceneCount = (mod.databases.scenes || []).length;
    const mainCGCount = (mod.databases.mainCG || []).length;

    box.innerHTML = `
      <h3>初始化带团板</h3>
      <p>选择流程单元的组织方式，快速搭建带团骨架</p>
      <div class="wizard-option" id="wizardOptScene" onclick="BoardManager._wizardSelectType('scenes')">
        <div class="opt-icon"><span class="icon"><svg><use href="#i-map"/></svg></span></div>
        <div class="opt-text">
          <h4>以场景为单元</h4>
          <p>从场景库中选取条目，每个场景作为一个流程单元（${sceneCount} 个可用）</p>
        </div>
      </div>
      <div class="wizard-option" id="wizardOptMainCG" onclick="BoardManager._wizardSelectType('mainCG')">
        <div class="opt-icon"><span class="icon"><svg><use href="#i-book"/></svg></span></div>
        <div class="opt-text">
          <h4>以关键剧情为单元</h4>
          <p>从主线 CG 库中选取条目，每个关键剧情作为一个流程单元（${mainCGCount} 个可用）</p>
        </div>
      </div>
      <div class="wizard-option skip" id="wizardOptSkip" onclick="BoardManager.hideSetupWizard()">
        <div class="opt-icon"><span class="icon"><svg><use href="#i-edit"/></svg></span></div>
        <div class="opt-text">
          <h4>跳过初始化，我要手搓带团板！</h4>
          <p>直接进入空白带团板，从零开始自由构建</p>
        </div>
      </div>
      <div id="wizardEntryList" style="display:none;"></div>
      <div class="wizard-actions" id="wizardActions" style="display:none;">
        <button onclick="BoardManager.hideSetupWizard()">取消</button>
        <button class="btn-accent" id="wizardConfirmBtn" onclick="BoardManager._wizardConfirm()" disabled>确认生成</button>
      </div>
    `;
    wizard.classList.remove('hidden');
    this._wizardType = null;
    this._wizardSelectedIds = new Set();
  },

  hideSetupWizard() {
    const wizard = document.getElementById('boardSetupWizard');
    if (wizard) wizard.classList.add('hidden');
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('setupWizardClosed', {});
    }
  },

  /* 选择组织方式 */
  _wizardSelectType(type) {
    this._wizardType = type;
    this._wizardSelectedIds = new Set();

    // 高亮选中项
    document.getElementById('wizardOptScene').classList.toggle('selected', type === 'scenes');
    document.getElementById('wizardOptMainCG').classList.toggle('selected', type === 'mainCG');

    // 显示条目列表和确认按钮
    const listEl = document.getElementById('wizardEntryList');
    const actionsEl = document.getElementById('wizardActions');
    listEl.style.display = '';
    actionsEl.style.display = '';

    const mod = AppState.currentModule;
    const entries = mod.databases[type] || [];
    const cfg = DatabaseManager.getMergedDbConfig()[type];

    if (entries.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">该数据库暂无条目，请先在编辑器中添加</div>`;
      return;
    }

    let html = `<div class="wizard-entries">`;
    entries.forEach(entry => {
      const title = entry.name || (entry.content || '').substring(0, 30) || '未命名';
      html += `<div class="wizard-entry-item" data-entry-id="${entry.id}" onclick="BoardManager._wizardToggleEntry('${entry.id}', this)">`;
      html += `<input type="checkbox" ${this._wizardSelectedIds.has(entry.id) ? 'checked' : ''} onclick="event.stopPropagation(); BoardManager._wizardToggleEntry('${entry.id}', this.closest('.wizard-entry-item'))">`;
      html += `<span>${this._esc(title)}</span>`;
      html += `</div>`;
    });
    html += `</div>`;
    html += `<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">点击条目或勾选复选框选择，已选 <span id="wizardSelCount">0</span> 项</div>`;
    listEl.innerHTML = html;

    this._updateWizardBtn();
  },

  /* 切换条目选中 */
  _wizardToggleEntry(entryId, el) {
    if (this._wizardSelectedIds.has(entryId)) {
      this._wizardSelectedIds.delete(entryId);
      el.classList.remove('selected');
      el.querySelector('input[type="checkbox"]').checked = false;
    } else {
      this._wizardSelectedIds.add(entryId);
      el.classList.add('selected');
      el.querySelector('input[type="checkbox"]').checked = true;
    }
    this._updateWizardBtn();
  },

  _updateWizardBtn() {
    const btn = document.getElementById('wizardConfirmBtn');
    const countEl = document.getElementById('wizardSelCount');
    if (btn) btn.disabled = this._wizardSelectedIds.size === 0;
    if (countEl) countEl.textContent = this._wizardSelectedIds.size;
  },

  /* 确认生成 */
  _wizardConfirm() {
    if (!this._wizardType || this._wizardSelectedIds.size === 0) return;

    const board = this.getBoard();
    const mod = AppState.currentModule;
    const entries = mod.databases[this._wizardType] || [];

    board.unitType = this._wizardType;

    entries.forEach(entry => {
      if (!this._wizardSelectedIds.has(entry.id)) return;
      const title = entry.name || (entry.content || '').substring(0, 30) || '未命名';
      const unit = {
        id: AppState.generateUUID(),
        title: title,
        description: (entry.content || '').substring(0, 100) || '流程备注',
        sourceEntryId: entry.id,
        notes: [],
        connections: [],
        viewport: { x: 0, y: 0, scale: 1 }
      };
      board.flowUnits.push(unit);
    });

    this.currentUnitIndex = 0;
    this.hideSetupWizard();
    this.render();
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* ==================== 便签操作 ==================== */

  /* 显示创建便签类型选择面板 */
  showCreateNoteMenu(event) {
    const existing = document.getElementById('noteTypePicker');
    if (existing) existing.remove();

    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();

    // 获取所有类型的数据库配置（含自定义类型）
    const typeList = Object.entries(DatabaseManager.getMergedDbConfig());

    let gridHtml = '';
    typeList.forEach(([key, cfg]) => {
      gridHtml += `<div class="note-type-item" onclick="BoardManager._selectNoteType('${key}')">`;
      gridHtml += `<span class="icon"><svg><use href="#${cfg.icon}"/></svg></span>`;
      gridHtml += `<span>${this._esc(cfg.name)}</span>`;
      gridHtml += `</div>`;
    });

    const picker = document.createElement('div');
    picker.className = 'note-type-picker';
    picker.id = 'noteTypePicker';
    picker.innerHTML = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">${gridHtml}</div>`;
    document.body.appendChild(picker);

    const pickerRect = picker.getBoundingClientRect();
    const pickerW = pickerRect.width;
    const pickerH = pickerRect.height;

    let left = rect.left;
    if (left + pickerW > window.innerWidth - 10) {
      left = window.innerWidth - pickerW - 10;
    }
    if (left < 10) left = 10;

    let top = rect.top - pickerH - 8;
    if (top < 10) {
      top = rect.bottom + 8;
    }
    if (top + pickerH > window.innerHeight - 10) {
      top = Math.max(10, window.innerHeight - pickerH - 10);
    }

    picker.style.left = left + 'px';
    picker.style.top = top + 'px';

    // 点击外部关闭
    const closeHandler = (e) => {
      if (!picker.contains(e.target) && e.target !== btn) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  },

  /* 选择便签类型并创建 */
  _selectNoteType(type) {
    const picker = document.getElementById('noteTypePicker');
    if (picker) picker.remove();
    this.createNote(type);
  },

  createNote(type) {
    const unit = this.getCurrentUnit();
    if (!unit) return;

    // 在视口中心附近创建（使用实际画布容器尺寸）
    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth;
      viewH = unitCanvasEl.parentElement.clientHeight;
    }
    const center = this._screenToVirtual(viewW / 2, viewH / 2);
    const vp = this._getUnitViewport();
    const centerX = center.x + vp.x - 100;
    const centerY = center.y + vp.y - 75;

    const note = {
      id: AppState.generateUUID(),
      type: type,
      title: '新便签',
      content: '',
      x: centerX + (Math.random() * 60 - 30),
      y: centerY + (Math.random() * 60 - 30),
      width: 270,
      height: 150,
      used: false,
      locked: false,
      sourceEntryId: null,
      characterData: null,
      diceRanges: null
    };

    // 特殊类型初始化
    if (type === 'encounters') {
      note.diceRanges = [{ min: 1, max: 5, content: '' }];
      note.title = '随机遭遇';
    } else if (type === 'blindbox') {
      note.diceRanges = { dieType: 'd20', headers: [], ranges: [{ min: 1, max: 5, content: '' }] };
      note.title = '盲盒';
    } else if (type === 'characters') {
      if (SystemManager.getCurrentSystem() === 'coc7') {
        note.characterData = _createCocCharacterData();
      } else {
        note.characterData = { name: '新角色', fields: {} };
      }
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
      note.title = '新角色';
    }

    this._pushUndo({ type: 'addNote', noteId: note.id, unitIndex: this.currentUnitIndex, noteData: null, connectionsData: null });
    unit.notes.push(note);
    // 直接创建单个便签 DOM，不重新渲染所有
    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (canvas) {
      this.renderNote(note, canvas, this.currentUnitIndex);
    }
    requestAnimationFrame(() => {
      this.renderConnections(this.currentUnitIndex);
      this.renderMinimap();
    });
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(this.currentUnitIndex);

    if (type === 'plaintext' || type === 'text' || type === 'encounters' || type === 'blindbox') {
      this.editNote(note.id, this.currentUnitIndex);
    }
  },

  /* ==================== 纯文本块 ==================== */

  /* 创建纯文本块 */
  createPlainText() {
    const unit = this.getCurrentUnit();
    if (!unit) return;

    // 在视口中心创建（使用实际画布容器尺寸）
    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth;
      viewH = unitCanvasEl.parentElement.clientHeight;
    }
    const vp2 = this._getUnitViewport();
    const center2 = this._screenToVirtual(viewW / 2, viewH / 2);
    const centerX2 = center2.x + vp2.x - 150;
    const centerY2 = center2.y + vp2.y - 60;

    const block = {
      id: AppState.generateUUID(),
      type: 'plaintext',
      content: '双击编辑文本',
      x: centerX2,
      y: centerY2,
      width: 300,
      height: 120,
      style: {
        fontSize: 14,
        color: '',
        bgColor: '',
        align: 'left',
        bold: false,
        italic: false,
        underline: false,
        border: 'solid',
        opacity: 1
      }
    };

    this._pushUndo({ type: 'addNote', noteId: block.id, unitIndex: this.currentUnitIndex, noteData: null, connectionsData: null });
    unit.notes.push(block);
    // 直接创建单个 DOM
    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (canvas) {
      this.renderNote(block, canvas, this.currentUnitIndex);
    }
    requestAnimationFrame(() => {
      this.renderConnections(this.currentUnitIndex);
      this.renderMinimap();
    });
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(this.currentUnitIndex);
    DocEditor.showToast('已添加纯文本块', 'success');
  },

  /* 插入图片元素（工具栏按钮触发） */
  async insertImageElement() {
    if (!window.electronAPI || !window.electronAPI.pickImageFile) {
      DocEditor.showToast('仅Electron版本支持插入图片', 'error');
      return;
    }
    const filePath = await window.electronAPI.pickImageFile();
    if (!filePath) return;
    await this._addImageToCanvas(filePath);
  },

  /* 将图片文件添加到当前画布 */
  async _addImageToCanvas(filePath, dropX, dropY) {
    const unit = this.getCurrentUnit();
    if (!unit) return;

    // 生成目标文件名
    const ext = filePath.split('.').pop().toLowerCase();
    const moduleId = AppState.currentModuleId || 'default';
    const uuid = AppState.generateUUID();
    const filename = moduleId + '_' + uuid + '.' + ext;

    // 确保 images 目录存在
    const imagesDir = (AppState.workDirPath || '') + '/images';
    if (window.electronAPI && window.electronAPI.ensureDir) {
      await window.electronAPI.ensureDir(imagesDir);
    }

    // 复制文件
    const destPath = imagesDir + '/' + filename;
    if (window.electronAPI && window.electronAPI.copyFile) {
      const ok = await window.electronAPI.copyFile(filePath, destPath);
      if (!ok) {
        DocEditor.showToast('图片复制失败', 'error');
        return;
      }
    }

    // 计算放置位置
    let posX, posY;
    if (dropX !== undefined && dropY !== undefined) {
      // 拖拽放置：使用放置点坐标
      const vp = this._getUnitViewport();
      posX = dropX - vp.x;
      posY = dropY - vp.y;
    } else {
      // 工具栏插入：放在视口中心
      const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
      let viewW = 800, viewH = 600;
      if (unitCanvasEl && unitCanvasEl.parentElement) {
        viewW = unitCanvasEl.parentElement.clientWidth;
        viewH = unitCanvasEl.parentElement.clientHeight;
      }
      const vp2 = this._getUnitViewport();
      const center = this._screenToVirtual(viewW / 2, viewH / 2);
      posX = center.x + vp2.x - 100;
      posY = center.y + vp2.y - 75;
    }

    const imgNote = {
      id: uuid,
      type: 'image',
      src: filename,
      x: posX,
      y: posY,
      width: 200,
      height: 150
    };

    this._pushUndo({ type: 'addNote', noteId: imgNote.id, unitIndex: this.currentUnitIndex, noteData: null, connectionsData: null });
    unit.notes.push(imgNote);

    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (canvas) {
      this.renderNote(imgNote, canvas, this.currentUnitIndex);
    }
    requestAnimationFrame(() => {
      this.renderConnections(this.currentUnitIndex);
      this.renderMinimap();
    });
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(this.currentUnitIndex);
    DocEditor.showToast('已插入图片', 'success');
  },

  /* 渲染纯文本块 */
  _renderPlainTextBlock(note, container, unitIndex) {
    const el = document.createElement('div');
    el.className = 'plain-text-block';
    el.dataset.noteId = note.id;
    el.dataset.type = 'plaintext';

    // 使用虚拟坐标直接定位，画布 CSS transform 负责视口偏移
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
    el.style.width = (note.width || 300) + 'px';
    el.style.height = (note.height || 120) + 'px';
    if (note.zIndex) el.style.zIndex = note.zIndex;

    const style = note.style || {};
    if (style.opacity !== undefined && style.opacity !== 1) {
      el.style.opacity = style.opacity;
    }
    if (style.bgColor) {
      el.style.background = style.bgColor;
    }
    if (style.border === 'none') {
      el.style.border = 'none';
    } else if (style.border === 'dashed') {
      el.style.borderStyle = 'dashed';
    }

    let contentStyle = '';
    if (style.fontSize) contentStyle += `font-size:${style.fontSize}px;`;
    if (style.color) contentStyle += `color:${style.color};`;
    if (style.align) contentStyle += `text-align:${style.align};`;
    if (style.bold) contentStyle += 'font-weight:700;';
    if (style.italic) contentStyle += 'font-style:italic;';
    if (style.underline) contentStyle += 'text-decoration:underline;';

    el.innerHTML = `<div class="pt-content" style="${contentStyle}">${this._esc(note.content || '')}</div>`;
    el.insertAdjacentHTML('beforeend', `<div class="pt-resize-handle" onpointerdown="event.stopPropagation(); BoardManager.startResize(event, '${note.id}', ${unitIndex})"></div>`);
    el.insertAdjacentHTML('beforeend', `<div class="pt-delete-btn" onclick="event.stopPropagation(); BoardManager.deletePlainText('${note.id}', ${unitIndex})" title="删除"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></div>`);
    el.insertAdjacentHTML('beforeend', `<div class="pt-copy-btn" onclick="event.stopPropagation(); BoardManager.copyNoteText('${note.id}', ${unitIndex})" title="复制文本"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></div>`);

    // 事件
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        if (this._waitingForConnectSource || this.isConnecting) {
          this._exitConnectMode();
        }
        return;
      }
      if (e.target.closest('.pt-resize-handle')) return;
      if (e.target.closest('.pt-copy-btn')) return;
      // 连线模式检查
      if (this._waitingForConnectSource) {
        this._waitingForConnectSource = false;
        this.startConnection(note.id, unitIndex);
        return;
      }
      if (this.isConnecting && this._connectingUnitIndex === unitIndex) {
        if (this.connectingFrom !== note.id) {
          this.completeConnection(note.id, unitIndex);
        }
        return;
      }
      if (this._isErasingConnections) return;
      this.startNoteDrag(e, note.id, unitIndex);
    });

    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.pt-resize-handle')) return;
      this.editPlainText(note.id, unitIndex);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waitingForConnectSource || this.isConnecting) {
        this._exitConnectMode();
        return;
      }
      if (this._isErasingConnections) {
        this._exitEraseMode();
        return;
      }
      this.showPlainTextContextMenu(e, note.id, unitIndex);
    });

    container.appendChild(el);
  },

  /* 渲染图片元素 */
  _renderImageElement(note, container, unitIndex) {
    const el = document.createElement('div');
    el.className = 'canvas-image';
    el.dataset.noteId = note.id;
    el.dataset.type = 'image';

    // 虚拟坐标直接定位
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
    el.style.width = (note.width || 200) + 'px';
    el.style.height = (note.height || 150) + 'px';
    if (note.zIndex) el.style.zIndex = note.zIndex;
    if (note.locked) el.classList.add('locked');

    // 解析图片路径
    const imgSrc = this._resolveImagePath(note.src);
    const img = document.createElement('img');
    img.src = imgSrc;
    img.draggable = false;
    img.onerror = () => {
      img.remove();
      const ph = document.createElement('div');
      ph.className = 'img-placeholder';
      ph.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" style="stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;margin-bottom:4px;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>图片文件未找到</span><span style="font-size:10px;opacity:0.7;">请重新插入或检查工作目录</span>';
      el.insertBefore(ph, el.firstChild);
    };
    el.appendChild(img);

    // 拉伸手柄
    const handle = document.createElement('div');
    handle.className = 'img-resize-handle';
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      BoardManager.startResize(e, note.id, unitIndex);
    });
    el.appendChild(handle);

    // 事件：pointerdown
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        if (this._waitingForConnectSource || this.isConnecting) {
          this._exitConnectMode();
        }
        return;
      }
      if (e.target.closest('.img-resize-handle')) return;
      // 连线模式
      if (this._waitingForConnectSource) {
        this._waitingForConnectSource = false;
        this.startConnection(note.id, unitIndex);
        return;
      }
      if (this.isConnecting && this._connectingUnitIndex === unitIndex) {
        if (this.connectingFrom !== note.id) {
          this.completeConnection(note.id, unitIndex);
        }
        return;
      }
      if (this._isErasingConnections) return;
      this.startNoteDrag(e, note.id, unitIndex);
    });

    // 事件：右键菜单
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waitingForConnectSource || this.isConnecting) {
        this._exitConnectMode();
        return;
      }
      if (this._isErasingConnections) {
        this._exitEraseMode();
        return;
      }
      this.showImageContextMenu(e, note.id, unitIndex);
    });

    container.appendChild(el);
  },

  /* 解析图片文件名到完整路径 */
  _resolveImagePath(filename) {
    if (!filename) return '';
    const base = AppState.workDirPath || '';
    // Electron / 本地文件系统：使用 file:// 协议
    const fullPath = base + '/images/' + filename;
    if (window.electronAPI) {
      return 'file:///' + fullPath.replace(/\\/g, '/');
    }
    // 浏览器 File System Access API：使用相对路径（需同源）
    return 'images/' + filename;
  },

  /* 编辑纯文本块 */
  editPlainText(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    this.closeEditModal();
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'noteEditModal';

    const style = note.style || {};
    let bodyHtml = '';

    // 文本内容
    bodyHtml += `<div class="pt-edit-section"><label>文本内容</label>`;
    bodyHtml += `<textarea id="ptContent" style="width:100%;height:120px;border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;resize:vertical;outline:none;background:#f8f8f7;color:var(--text);box-sizing:border-box;">${this._esc(note.content || '')}</textarea></div>`;

    // 字体大小
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">字号</label>`;
    bodyHtml += `<input type="number" id="ptFontSize" value="${style.fontSize || 14}" min="10" max="48" step="1" style="width:60px;background:#f8f8f7;">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);min-width:40px;">透明度</label>`;
    bodyHtml += `<input type="range" id="ptOpacity" min="0.1" max="1" step="0.05" value="${style.opacity !== undefined ? style.opacity : 1}" style="flex:1;"><span id="ptOpacityVal" style="font-size:12px;color:var(--text-muted);min-width:30px;">${Math.round((style.opacity !== undefined ? style.opacity : 1) * 100)}%</span></div>`;

    // 颜色
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">文字颜色</label>`;
    bodyHtml += `<input type="color" id="ptColor" value="${style.color || '#333333'}">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);min-width:60px;">背景颜色</label>`;
    bodyHtml += `<input type="color" id="ptBgColor" value="${style.bgColor || '#ffffff'}">`;
    bodyHtml += `<button class="pt-style-btn" onclick="document.getElementById('ptBgColor').value='';this.style.opacity='0.5'" title="清除背景色" style="font-size:11px;width:auto;padding:0 6px;">清除</button></div>`;

    // 对齐
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">对齐</label>`;
    const aligns = ['left', 'center', 'right'];
    const alignIcons = ['◀', '◆', '▶'];
    aligns.forEach((a, i) => {
      const active = (style.align || 'left') === a ? ' active' : '';
      bodyHtml += `<button class="pt-style-btn${active}" data-align="${a}" onclick="document.querySelectorAll('[data-align]').forEach(b=>b.classList.remove('active'));this.classList.add('active');" title="${a}">${alignIcons[i]}</button>`;
    });
    bodyHtml += `<span style="width:12px;"></span>`;
    // 样式按钮
    const boldActive = style.bold ? ' active' : '';
    const italicActive = style.italic ? ' active' : '';
    const underlineActive = style.underline ? ' active' : '';
    bodyHtml += `<button class="pt-style-btn${boldActive}" id="ptBoldBtn" onclick="this.classList.toggle('active')" title="粗体" style="font-weight:700;">B</button>`;
    bodyHtml += `<button class="pt-style-btn${italicActive}" id="ptItalicBtn" onclick="this.classList.toggle('active')" title="斜体" style="font-style:italic;">I</button>`;
    bodyHtml += `<button class="pt-style-btn${underlineActive}" id="ptUnderlineBtn" onclick="this.classList.toggle('active')" title="下划线" style="text-decoration:underline;">U</button></div>`;

    // 边框
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">边框</label>`;
    const borders = ['solid', 'dashed', 'none'];
    const borderLabels = ['实线', '虚线', '无边框'];
    borders.forEach((b, i) => {
      const active = (style.border || 'solid') === b ? ' active' : '';
      bodyHtml += `<button class="pt-style-btn${active}" data-border="${b}" onclick="document.querySelectorAll('[data-border]').forEach(btn=>btn.classList.remove('active'));this.classList.add('active');" title="${borderLabels[i]}" style="width:auto;padding:0 8px;font-size:11px;">${borderLabels[i]}</button>`;
    });
    bodyHtml += `</div>`;

    modal.innerHTML = `
      <div class="board-edit-modal-content">
        <div class="board-edit-header">
          <h3>编辑纯文本</h3>
          <button onclick="BoardManager.closeEditModal()"><span class="icon"><svg><use href="#i-x"/></svg></span></button>
        </div>
        <div class="board-edit-body">${bodyHtml}</div>
        <div class="board-edit-footer">
          <button onclick="BoardManager.closeEditModal()">取消</button>
          <button class="btn-accent" onclick="BoardManager.savePlainTextEdit('${noteId}', ${unitIndex})">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 透明度滑块实时更新
    const opacityInput = document.getElementById('ptOpacity');
    const opacityVal = document.getElementById('ptOpacityVal');
    if (opacityInput && opacityVal) {
      opacityInput.addEventListener('input', () => {
        opacityVal.textContent = Math.round(opacityInput.value * 100) + '%';
      });
    }
  },

  /* 保存纯文本编辑 */
  savePlainTextEdit(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    const oldData = JSON.parse(JSON.stringify({ content: note.content, style: note.style }));

    note.content = document.getElementById('ptContent')?.value || '';
    const alignBtn = document.querySelector('[data-align].active');
    const borderBtn = document.querySelector('[data-border].active');
    note.style = {
      fontSize: parseInt(document.getElementById('ptFontSize')?.value) || 14,
      color: document.getElementById('ptColor')?.value || '',
      bgColor: document.getElementById('ptBgColor')?.value || '',
      align: alignBtn ? alignBtn.dataset.align : 'left',
      bold: document.getElementById('ptBoldBtn')?.classList.contains('active') || false,
      italic: document.getElementById('ptItalicBtn')?.classList.contains('active') || false,
      underline: document.getElementById('ptUnderlineBtn')?.classList.contains('active') || false,
      border: borderBtn ? borderBtn.dataset.border : 'solid',
      opacity: parseFloat(document.getElementById('ptOpacity')?.value) || 1
    };

    this.closeEditModal();
    // 直接更新 DOM 而非重新渲染所有便签
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) {
      // 更新内容
      const contentEl = el.querySelector('.pt-content');
      if (contentEl) {
        let contentStyle = '';
        const style = note.style;
        if (style.fontSize) contentStyle += `font-size:${style.fontSize}px;`;
        if (style.color) contentStyle += `color:${style.color};`;
        if (style.align) contentStyle += `text-align:${style.align};`;
        if (style.bold) contentStyle += 'font-weight:700;';
        if (style.italic) contentStyle += 'font-style:italic;';
        if (style.underline) contentStyle += 'text-decoration:underline;';
        contentEl.style.cssText = contentStyle;
        contentEl.textContent = note.content || '';
      }
      // 更新样式
      el.style.opacity = note.style.opacity !== undefined && note.style.opacity !== 1 ? note.style.opacity : '';
      el.style.background = note.style.bgColor || '';
      el.style.borderStyle = note.style.border === 'none' ? 'none' : note.style.border === 'dashed' ? 'dashed' : '';
    }
    this._pushUndo({ type: 'editNote', noteId: noteId, unitIndex: unitIndex, oldData: oldData, newData: JSON.parse(JSON.stringify({ content: note.content, style: note.style })) });
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 纯文本右键菜单 */
  showPlainTextContextMenu(e, noteId, unitIndex) {
    // 隐藏现有的便签右键菜单（不删除，保留 DOM 元素）
    const existing = document.getElementById('noteContextMenu');
    if (existing) {
      existing.classList.remove('visible');
      existing.style.left = '';
      existing.style.top = '';
    }
    const oldB = document.getElementById('battleCardContextMenu');
    if (oldB) oldB.remove();

    this.contextNoteId = noteId;
    this.contextUnitIndex = unitIndex;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'plainTextContextMenu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    menu.innerHTML = `
      <div class="ctx-menu-item" onclick="BoardManager.editPlainText('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> 编辑
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.startConnectionFromContext(); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span> 连线到...
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.copyNoteText('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制文本
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.duplicateElement(); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制一份
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'front'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="18 15 12 9 6 15"/></svg></span> 置于顶层
      </div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'back'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg></span> 置于底层
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager.deletePlainText('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> 删除
      </div>
    `;

    document.body.appendChild(menu);

    // 确保菜单不超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 10);
  },

  /* 图片元素右键菜单 */
  showImageContextMenu(e, noteId, unitIndex) {
    const existing = document.getElementById('noteContextMenu');
    if (existing) { existing.classList.remove('visible'); existing.style.left = ''; existing.style.top = ''; }
    const oldPt = document.getElementById('plainTextContextMenu');
    if (oldPt) oldPt.remove();
    const oldTxt = document.getElementById('textElementContextMenu');
    if (oldTxt) oldTxt.remove();
    const oldB = document.getElementById('battleCardContextMenu');
    if (oldB) oldB.remove();
    const oldImg = document.getElementById('imageContextMenu');
    if (oldImg) oldImg.remove();

    this.contextNoteId = noteId;
    this.contextUnitIndex = unitIndex;

    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    const note = unit ? unit.notes.find(n => n.id === noteId) : null;
    const isLocked = note && note.locked;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'imageContextMenu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    let items = '';
    // 连线
    items += `<div class="ctx-menu-item" onclick="BoardManager.startConnectionFromContext(); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span> 连线到...
    </div>`;
    // 复制一份
    items += `<div class="ctx-menu-item" onclick="BoardManager.duplicateElement(); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制到此单元附近
    </div>`;
    // 复制到剪贴板
    items += `<div class="ctx-menu-item" onclick="BoardManager.copyImageToClipboard('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制到剪贴板
    </div>`;
    items += `<div class="ctx-menu-sep"></div>`;
    // 置于顶层/底层
    items += `<div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'front'); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="18 15 12 9 6 15"/></svg></span> 置于顶层
    </div>`;
    items += `<div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'back'); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg></span> 置于底层
    </div>`;
    items += `<div class="ctx-menu-sep"></div>`;
    // 锁定/解锁
    items += `<div class="ctx-menu-item" onclick="BoardManager.toggleNoteLock('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">${isLocked
        ? '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'
        : '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/>'
      }</svg></span> ${isLocked ? '解锁' : '锁定'}
    </div>`;
    // 删除
    items += `<div class="ctx-menu-item" onclick="BoardManager.deleteImageElement('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
      <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> 删除
    </div>`;

    menu.innerHTML = items;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 10);
  },

  /* 删除图片元素 */
  deleteImageElement(noteId, unitIndex) {
    App.showConfirm('确定要删除这个图片元素吗？', '', '删除', () => {
      const units = this.getFlowUnits();
      const unit = units[unitIndex];
      if (!unit) return;
      const idx = unit.notes.findIndex(n => n.id === noteId);
      if (idx === -1) return;
      const deletedNote = unit.notes[idx];
      const savedConnections = unit.connections.filter(c => c.from === noteId || c.to === noteId);
      this._pushUndo({ type: 'deleteNote', noteId, unitIndex, noteData: JSON.parse(JSON.stringify(deletedNote)), connectionsData: savedConnections });
      unit.notes.splice(idx, 1);
      unit.connections = unit.connections.filter(c => c.from !== noteId && c.to !== noteId);
      const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
      if (el) el.remove();
      this.renderConnections(unitIndex);
      this.renderMinimap();
      this.saveBoard();
      StorageManager.scheduleSave();
      this._updateEmptyPrompt(unitIndex);
    });
  },

  /* 复制图片到系统剪贴板 */
  async copyImageToClipboard(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note || note.type !== 'image' || !note.src) return;

    const imgPath = this._resolveImagePath(note.src);
    try {
      const resp = await fetch(imgPath);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      DocEditor.showToast('图片已复制到剪贴板', 'success');
    } catch (err) {
      console.warn('复制图片到剪贴板失败:', err);
      DocEditor.showToast('复制失败，可能不支持此图片格式', 'error');
    }
  },

  /* 删除纯文本块 */
  deletePlainText(noteId, unitIndex) {
    App.showConfirm('确定要删除这个纯文本框吗？', '', '删除', () => {
      const units = this.getFlowUnits();
      const unit = units[unitIndex];
      if (!unit) return;
      const idx = unit.notes.findIndex(n => n.id === noteId);
      if (idx === -1) return;
      const deletedNote = unit.notes[idx];
      const savedConnections = unit.connections.filter(c => c.from === noteId || c.to === noteId);
      this._pushUndo({ type: 'deleteNote', noteId: noteId, unitIndex: unitIndex, noteData: JSON.parse(JSON.stringify(deletedNote)), connectionsData: savedConnections });
      unit.notes.splice(idx, 1);
      unit.connections = unit.connections.filter(c => c.from !== noteId && c.to !== noteId);
      // 直接移除 DOM
      const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
      if (el) el.remove();
      this.renderConnections(unitIndex);
      this.renderMinimap();
      this.saveBoard();
      StorageManager.scheduleSave();
      this._updateEmptyPrompt(unitIndex);
    });
  },

  /* ==================== 纯文字元素 ==================== */

  /* 创建纯文字元素 */
  createTextElement() {
    const unit = this.getCurrentUnit();
    if (!unit) return;

    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth;
      viewH = unitCanvasEl.parentElement.clientHeight;
    }
    const center3 = this._screenToVirtual(viewW / 2, viewH / 2);
    const vp3 = this._getUnitViewport();

    const textEl = {
      id: AppState.generateUUID(),
      type: 'text',
      content: '双击编辑文字',
      x: center3.x + vp3.x - 40,
      y: center3.y + vp3.y - 10,
      width: 100,
      height: 24,
      fontSize: 16,
      color: '#000000',
      bold: false,
      italic: false
    };

    this._pushUndo({ type: 'addNote', noteId: textEl.id, unitIndex: this.currentUnitIndex, noteData: null, connectionsData: null });
    unit.notes.push(textEl);
    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (canvas) {
      this.renderNote(textEl, canvas, this.currentUnitIndex);
    }
    requestAnimationFrame(() => {
      this.renderConnections(this.currentUnitIndex);
      this.renderMinimap();
    });
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(this.currentUnitIndex);
    DocEditor.showToast('已添加文字', 'success');
  },

  /* 创建背景框 */
  createBackgroundFrame() {
    const unit = this.getCurrentUnit();
    if (!unit) return;

    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth;
      viewH = unitCanvasEl.parentElement.clientHeight;
    }
    const vp = this._getUnitViewport();
    const center = this._screenToVirtual(viewW / 2, viewH / 2);
    const cx = center.x + (vp ? vp.x : 0) - 200;
    const cy = center.y + (vp ? vp.y : 0) - 150;

    const frame = {
      id: AppState.generateUUID(),
      type: 'background_frame',
      x: cx,
      y: cy,
      width: 400,
      height: 300,
      locked: false,
      style: {
        borderWidth: 2,
        borderColor: '#c0ab84',
        borderOpacity: 0.8,
        bgColor: '#3a3a4a',
        bgOpacity: 0.25
      }
    };
    unit.backgroundFrames.push(frame);

    this.renderBackgroundFrames(this.currentUnitIndex);
    this._selectBgFrame(frame.id);
    this.saveBoard();
    StorageManager.scheduleSave();
    DocEditor.showToast('已添加背景框', 'success');
  },

  /* 渲染单个背景框 DOM */
  _renderBgFrame(frame, container, unitIndex) {
    const s = frame.style || {};
    const el = document.createElement('div');
    el.className = 'bg-frame';
    el.dataset.bgFrameId = frame.id;
    el.dataset.type = 'background_frame';
    el.setAttribute('data-unit-index', unitIndex);

    const bw = s.borderWidth || 2;
    const bc = s.borderColor || '#c0ab84';
    const bo = s.borderOpacity !== undefined ? s.borderOpacity : 0.8;
    const bgc = s.bgColor || '#3a3a4a';
    const bgo = s.bgOpacity !== undefined ? s.bgOpacity : 0.25;

    el.style.left = frame.x + 'px';
    el.style.top = frame.y + 'px';
    el.style.width = (frame.width || 400) + 'px';
    el.style.height = (frame.height || 300) + 'px';
    el.style.border = bw + 'px solid ' + this._rgbaFromHex(bc, bo);
    el.style.backgroundColor = this._rgbaFromHex(bgc, bgo);

    if (frame.id === this._selectedBgFrame) {
      el.classList.add('selected');
    }

    if (frame.locked) {
      el.classList.add('locked');
      el.style.cursor = 'default';
    }

    // 缩放手柄（锁定时不显示）
    if (!frame.locked) {
      const handle = document.createElement('div');
      handle.className = 'bg-frame-resize';
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this._startBgFrameResize(e, frame.id, unitIndex);
      });
      el.appendChild(handle);
    }

    // pointerdown: 选中 + 拖拽（锁定时跳过拖拽）
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.bg-frame-resize')) return;
      e.stopPropagation();
      e.preventDefault();
      this._selectBgFrame(frame.id);
      if (!frame.locked) {
        this._startBgFrameDrag(e, frame.id, unitIndex);
      }
    });

    // 双击：编辑
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.editBackgroundFrame(frame.id, unitIndex);
    });

    // 右键菜单
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._selectBgFrame(frame.id);
      this._showBgFrameCtxMenu(e, frame.id, unitIndex);
    });

    container.appendChild(el);
  },

  /* 渲染流程单元内所有背景框 */
  renderBackgroundFrames(unitIndex) {
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (!canvas) return;
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    if (!unit.backgroundFrames) unit.backgroundFrames = [];

    // 清除旧背景框
    canvas.querySelectorAll('.bg-frame').forEach(el => el.remove());

    unit.backgroundFrames.forEach(frame => {
      this._renderBgFrame(frame, canvas, unitIndex);
    });
  },

  /* 选中背景框 */
  _selectBgFrame(frameId) {
    if (this._selectedBgFrame === frameId) return;
    this._selectedBgFrame = frameId;
    document.querySelectorAll('.bg-frame').forEach(el => {
      const id = el.dataset.bgFrameId;
      el.classList.toggle('selected', id === frameId);
    });
  },

  /* 取消背景框选中 */
  _deselectBgFrame() {
    if (!this._selectedBgFrame) return;
    this._selectedBgFrame = null;
    document.querySelectorAll('.bg-frame.selected').forEach(el => el.classList.remove('selected'));
  },

  /* 开始拖拽背景框 */
  _startBgFrameDrag(e, frameId, unitIndex) {
    const el = document.querySelector('.bg-frame[data-bg-frame-id="' + frameId + '"]');
    if (!el) return;
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    this._bgFrameDragging = true;
    this._bgFrameTarget = frameId;
    this._bgFrameUnitIndex = unitIndex;

    if (e.pointerId != null) {
      el.setPointerCapture(e.pointerId);
    }

    el.classList.add('dragging');

    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    const canvasRect = canvas.getBoundingClientRect();
    const s = this.scale || 1;
    this._bgFrameDragStart = {
      frameX: frame.x,
      frameY: frame.y,
      screenX: e.clientX - canvasRect.left,
      screenY: e.clientY - canvasRect.top,
      offsetX: (e.clientX - canvasRect.left) / s - frame.x,
      offsetY: (e.clientY - canvasRect.top) / s - frame.y,
      altKey: e.altKey,
      cloned: false,
      cloneId: null
    };

    const onMove = (ev) => {
      if (!this._bgFrameDragging || this._bgFrameTarget !== frameId) return;
      const cRect = canvas.getBoundingClientRect();
      const ss = this.scale || 1;
      const mx = (ev.clientX - cRect.left) / ss;
      const my = (ev.clientY - cRect.top) / ss;
      const ds = this._bgFrameDragStart;

      // Alt 拖拽 → 快速复制
      if (ev.altKey && !ds.cloned && (Math.abs(mx - ds.frameX - ds.offsetX) > 3 || Math.abs(my - ds.frameY - ds.offsetY) > 3)) {
        const clone = {
          id: AppState.generateUUID(),
          type: 'background_frame',
          x: ds.frameX,
          y: ds.frameY,
          width: frame.width,
          height: frame.height,
          locked: false,
          style: Object.assign({}, frame.style)
        };
        unit.backgroundFrames.push(clone);
        this.renderBackgroundFrames(unitIndex);
        this._selectBgFrame(clone.id);
        ds.cloned = true;
        ds.cloneId = clone.id;
        this._bgFrameTarget = clone.id;
        this._bgFrameDragStart.frameX = clone.x;
        this._bgFrameDragStart.offsetX = mx - clone.x;
        this._bgFrameDragStart.offsetY = my - clone.y;
        return;
      }

      const targetId = ds.cloned ? ds.cloneId : frameId;
      const tFrame = unit.backgroundFrames.find(f => f.id === targetId);
      if (!tFrame) return;

      tFrame.x = mx - ds.offsetX;
      tFrame.y = my - ds.offsetY;
      const tEl = document.querySelector('.bg-frame[data-bg-frame-id="' + targetId + '"]');
      if (tEl) {
        tEl.style.left = tFrame.x + 'px';
        tEl.style.top = tFrame.y + 'px';
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      el.classList.remove('dragging');
      this._bgFrameDragging = false;
      this._bgFrameTarget = null;
      this._bgFrameUnitIndex = -1;
      this._bgFrameDragStart = null;
      this.renderMinimap();
      this.saveBoard();
      StorageManager.scheduleSave();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  /* 开始调整背景框尺寸 */
  _startBgFrameResize(e, frameId, unitIndex) {
    const el = document.querySelector('.bg-frame[data-bg-frame-id="' + frameId + '"]');
    if (!el) return;
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    this._bgFrameResizing = true;
    this._bgFrameTarget = frameId;
    this._bgFrameUnitIndex = unitIndex;

    if (e.pointerId != null) {
      el.setPointerCapture(e.pointerId);
    }

    const s = this.scale || 1;
    this._bgFrameResizeStart = {
      w: frame.width || 400,
      h: frame.height || 300,
      sx: e.clientX / s,
      sy: e.clientY / s
    };

    const onMove = (ev) => {
      if (!this._bgFrameResizing) return;
      const ss = this.scale || 1;
      const rs = this._bgFrameResizeStart;
      frame.width = Math.max(80, rs.w + (ev.clientX / ss - rs.sx));
      frame.height = Math.max(60, rs.h + (ev.clientY / ss - rs.sy));
      el.style.width = frame.width + 'px';
      el.style.height = frame.height + 'px';
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      this._bgFrameResizing = false;
      this._bgFrameTarget = null;
      this._bgFrameUnitIndex = -1;
      this._bgFrameResizeStart = null;
      this.renderMinimap();
      this.saveBoard();
      StorageManager.scheduleSave();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  /* 编辑背景框（弹窗） */
  editBackgroundFrame(frameId, unitIndex) {
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    // 关闭旧弹窗
    const old = document.getElementById('bgFrameEditModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'bgFrameEditModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:300;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;opacity:1;visibility:visible;';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const s = frame.style || {};

    let bodyHtml = '';
    bodyHtml += '<div class="bg-frame-edit-section">';
    bodyHtml += '<label class="section-title">边框</label>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>粗细</label>';
    bodyHtml += '<input type="number" id="bgBorderWidth" value="' + (s.borderWidth || 2) + '" min="1" max="20" step="1">';
    bodyHtml += '<label>px</label></div>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>颜色</label>';
    bodyHtml += '<input type="color" id="bgBorderColor" value="' + (s.borderColor || '#c0ab84') + '">';
    bodyHtml += '<label style="min-width:24px;">透明</label>';
    bodyHtml += '<input type="range" id="bgBorderOpacity" min="0" max="1" step="0.05" value="' + (s.borderOpacity !== undefined ? s.borderOpacity : 0.8) + '">';
    bodyHtml += '<span class="opacity-val" id="bgBorderOpacityVal">' + Math.round((s.borderOpacity !== undefined ? s.borderOpacity : 0.8) * 100) + '%</span></div>';
    bodyHtml += '</div>';
    bodyHtml += '<div class="bg-frame-edit-section">';
    bodyHtml += '<label class="section-title">底色</label>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>颜色</label>';
    bodyHtml += '<input type="color" id="bgBgColor" value="' + (s.bgColor || '#3a3a4a') + '">';
    bodyHtml += '<label style="min-width:24px;">透明</label>';
    bodyHtml += '<input type="range" id="bgBgOpacity" min="0" max="1" step="0.05" value="' + (s.bgOpacity !== undefined ? s.bgOpacity : 0.25) + '">';
    bodyHtml += '<span class="opacity-val" id="bgBgOpacityVal">' + Math.round((s.bgOpacity !== undefined ? s.bgOpacity : 0.25) * 100) + '%</span></div>';
    bodyHtml += '</div>';
    bodyHtml += '<div class="bg-frame-edit-actions">';
    bodyHtml += '<button id="bgDupBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> 快速复制</button>';
    bodyHtml += '<button class="danger" id="bgDelBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> 删除背景框</button>';
    bodyHtml += '</div>';

    modal.innerHTML =
      '<div class="modal-content" style="background:#1e1e2e;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:0;width:440px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);">' +
        '<div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);">' +
          '<h3 style="margin:0;font-size:15px;color:#e0d8c8;">编辑背景框</h3>' +
          '<button class="modal-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;line-height:1;">&times;</button>' +
        '</div>' +
        '<div style="padding:16px 20px;">' + bodyHtml + '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid rgba(255,255,255,0.08);">' +
          '<button class="modal-cancel" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#ccc;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">取消</button>' +
          '<button class="modal-save" style="background:#d4a853;color:#1a1a2e;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const self = this;
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-save').addEventListener('click', () => {
      self._saveBgFrameEdit(frameId, unitIndex);
      modal.remove();
    });

    // 滑块实时更新
    const boSlider = modal.querySelector('#bgBorderOpacity');
    const boVal = modal.querySelector('#bgBorderOpacityVal');
    boSlider.addEventListener('input', () => { boVal.textContent = Math.round(boSlider.value * 100) + '%'; });
    const bgoSlider = modal.querySelector('#bgBgOpacity');
    const bgoVal = modal.querySelector('#bgBgOpacityVal');
    bgoSlider.addEventListener('input', () => { bgoVal.textContent = Math.round(bgoSlider.value * 100) + '%'; });

    // 快速复制
    modal.querySelector('#bgDupBtn').addEventListener('click', () => {
      const newId = self._duplicateBgFrame(frameId, unitIndex);
      if (newId) { modal.remove(); self.editBackgroundFrame(newId, unitIndex); }
    });

    // 删除
    modal.querySelector('#bgDelBtn').addEventListener('click', () => {
      self._deleteBgFrame(frameId, unitIndex);
      modal.remove();
    });
  },

  /* 保存背景框编辑 */
  _saveBgFrameEdit(frameId, unitIndex) {
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    const modal = document.getElementById('bgFrameEditModal');
    if (!modal) return;

    if (!frame.style) frame.style = {};
    frame.style.borderWidth = parseInt(modal.querySelector('#bgBorderWidth')?.value) || 2;
    frame.style.borderColor = modal.querySelector('#bgBorderColor')?.value || '#c0ab84';
    frame.style.borderOpacity = parseFloat(modal.querySelector('#bgBorderOpacity')?.value) || 0.8;
    frame.style.bgColor = modal.querySelector('#bgBgColor')?.value || '#3a3a4a';
    frame.style.bgOpacity = parseFloat(modal.querySelector('#bgBgOpacity')?.value) || 0.25;

    this.renderBackgroundFrames(unitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 删除背景框 */
  _deleteBgFrame(frameId, unitIndex) {
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const idx = unit.backgroundFrames.findIndex(f => f.id === frameId);
    if (idx < 0) return;
    unit.backgroundFrames.splice(idx, 1);
    if (this._selectedBgFrame === frameId) this._selectedBgFrame = null;
    this.renderBackgroundFrames(unitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
    DocEditor.showToast('已删除背景框', 'success');
  },

  /* 切换背景框锁定状态 */
  _toggleBgFrameLock(frameId, unitIndex) {
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;
    frame.locked = !frame.locked;
    this.renderBackgroundFrames(unitIndex);
    if (!frame.locked) {
      this._selectBgFrame(frameId);
    }
    this.saveBoard();
    StorageManager.scheduleSave();
    DocEditor.showToast(frame.locked ? '已锁定背景框' : '已解锁背景框', 'success');
  },

  /* 复制背景框，返回新 ID */
  _duplicateBgFrame(frameId, unitIndex) {
    const unit = this.getFlowUnits()[unitIndex];
    if (!unit) return null;
    const frame = unit.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return null;

    const clone = {
      id: AppState.generateUUID(),
      type: 'background_frame',
      x: frame.x + 40,
      y: frame.y + 30,
      width: frame.width,
      height: frame.height,
      locked: false,
      style: Object.assign({}, frame.style)
    };
    unit.backgroundFrames.push(clone);
    this.renderBackgroundFrames(unitIndex);
    this._selectBgFrame(clone.id);
    this.saveBoard();
    StorageManager.scheduleSave();
    DocEditor.showToast('已复制背景框', 'success');
    return clone.id;
  },

  /* 背景框右键菜单 */
  _showBgFrameCtxMenu(e, frameId, unitIndex) {
    this._hideBgFrameCtxMenu();

    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    const vp = canvas.parentElement;
    const vpRect = vp.getBoundingClientRect();

    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    const frame = unit && unit.backgroundFrames ? unit.backgroundFrames.find(f => f.id === frameId) : null;

    const menu = document.createElement('div');
    menu.className = 'note-context-menu';
    menu.id = 'bgFrameCtxMenu';
    menu.style.cssText = 'position:fixed;z-index:250;display:block;min-width:140px;';
    const lockText = frame && frame.locked ? '解锁背景框' : '锁定背景框';
    const lockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
    const unlockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
    menu.innerHTML =
      '<div class="ctx-item" id="bgCtxEdit"><span class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> 编辑背景框</div>' +
      '<div class="ctx-item" id="bgCtxLock"><span class="icon">' + (frame && frame.locked ? unlockIcon : lockIcon) + '</span> ' + lockText + '</div>' +
      '<div class="ctx-item" id="bgCtxDup"><span class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制背景框</div>' +
      '<div class="ctx-item ctx-danger" id="bgCtxDel"><span class="icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> 删除背景框</div>';
    document.body.appendChild(menu);

    let mx = e.clientX, my = e.clientY;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    if (mx + mw > window.innerWidth - 10) mx = window.innerWidth - mw - 10;
    if (my + mh > window.innerHeight - 10) my = window.innerHeight - mh - 10;
    if (mx < 10) mx = 10; if (my < 10) my = 10;
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';

    document.getElementById('bgCtxEdit').addEventListener('click', () => {
      this._hideBgFrameCtxMenu();
      this.editBackgroundFrame(frameId, unitIndex);
    });
    document.getElementById('bgCtxLock').addEventListener('click', () => {
      this._hideBgFrameCtxMenu();
      this._toggleBgFrameLock(frameId, unitIndex);
    });
    document.getElementById('bgCtxDup').addEventListener('click', () => {
      this._hideBgFrameCtxMenu();
      this._duplicateBgFrame(frameId, unitIndex);
    });
    document.getElementById('bgCtxDel').addEventListener('click', () => {
      this._hideBgFrameCtxMenu();
      this._deleteBgFrame(frameId, unitIndex);
    });

    const closeHandler = (ev) => {
      if (!menu.contains(ev.target)) {
        this._hideBgFrameCtxMenu();
        document.removeEventListener('pointerdown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', closeHandler), 0);
  },

  _hideBgFrameCtxMenu() {
    const menu = document.getElementById('bgFrameCtxMenu');
    if (menu) menu.remove();
  },

  /* hex颜色 + 透明度 → rgba（工具函数） */
  _rgbaFromHex(hex, alpha) {
    if (!hex) hex = '#000000';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, alpha)) + ')';
  },

  /* 渲染纯文字元素 */
  _renderTextElement(note, container, unitIndex) {
    const el = document.createElement('div');
    el.className = 'canvas-text-el';
    el.dataset.noteId = note.id;
    el.dataset.type = 'text';
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
    if (note.zIndex) el.style.zIndex = note.zIndex;
    el.style.fontSize = (note.fontSize || 16) + 'px';
    el.style.color = note.color || '#e0d8c8';
    if (note.bold) el.style.fontWeight = '700';
    if (note.italic) el.style.fontStyle = 'italic';
    el.textContent = note.content || '';

    // 事件
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        if (this._waitingForConnectSource || this.isConnecting) {
          this._exitConnectMode();
        }
        return;
      }
      if (this._waitingForConnectSource) {
        this._waitingForConnectSource = false;
        this.startConnection(note.id, unitIndex);
        return;
      }
      if (this.isConnecting && this._connectingUnitIndex === unitIndex) {
        if (this.connectingFrom !== note.id) {
          this.completeConnection(note.id, unitIndex);
        }
        return;
      }
      if (this._isErasingConnections) return;
      this.startNoteDrag(e, note.id, unitIndex);
    });

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.editTextElement(note.id, unitIndex);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waitingForConnectSource || this.isConnecting) {
        this._exitConnectMode();
        return;
      }
      if (this._isErasingConnections) {
        this._exitEraseMode();
        return;
      }
      this.showTextElementContextMenu(e, note.id, unitIndex);
    });

    container.appendChild(el);

    // 渲染后测量实际宽高
    requestAnimationFrame(() => {
      note.width = el.offsetWidth || 60;
      note.height = el.offsetHeight || 24;
    });
  },

  /* 纯文字元素右键菜单 */
  showTextElementContextMenu(e, noteId, unitIndex) {
    const existing = document.getElementById('noteContextMenu');
    if (existing) {
      existing.classList.remove('visible');
      existing.style.left = '';
      existing.style.top = '';
    }
    const old = document.getElementById('plainTextContextMenu');
    if (old) old.remove();
    const oldB = document.getElementById('battleCardContextMenu');
    if (oldB) oldB.remove();

    this.contextNoteId = noteId;
    this.contextUnitIndex = unitIndex;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'plainTextContextMenu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    menu.innerHTML = `
      <div class="ctx-menu-item" onclick="BoardManager.editTextElement('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> 编辑
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.startConnectionFromContext(); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span> 连线到...
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.copyNoteText('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制文本
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.duplicateElement(); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></span> 复制一份
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'front'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="18 15 12 9 6 15"/></svg></span> 置于顶层
      </div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${noteId}', ${unitIndex}, 'back'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg></span> 置于底层
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager.deleteTextElement('${noteId}', ${unitIndex}); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> 删除
      </div>
    `;

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 10);
  },

  /* 编辑纯文字元素 */
  editTextElement(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    this.closeEditModal();
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'noteEditModal';

    let bodyHtml = '';
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">内容</label>`;
    bodyHtml += `<textarea id="teContent" rows="3" style="flex:1;background:#f8f8f7;border:1px solid #d0d0d0;border-radius:6px;color:#343434;padding:8px;font-size:13px;resize:vertical;outline:none;">${this._esc(note.content || '')}</textarea></div>`;
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">字号</label>`;
    bodyHtml += `<input type="number" id="teFontSize" value="${note.fontSize || 16}" min="10" max="72" style="width:60px;background:#f8f8f7;border:1px solid #d0d0d0;border-radius:4px;color:#343434;padding:4px 8px;outline:none;">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);margin-left:12px;">颜色</label>`;
    bodyHtml += `<input type="color" id="teColor" value="${note.color || '#e0d8c8'}" style="width:32px;height:28px;border:none;background:transparent;cursor:pointer;"></div>`;
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">样式</label>`;
    const boldActive = note.bold ? ' active' : '';
    const italicActive = note.italic ? ' active' : '';
    bodyHtml += `<button class="pt-style-btn${boldActive}" id="teBoldBtn" onclick="this.classList.toggle('active')" title="粗体" style="font-weight:700;">B</button>`;
    bodyHtml += `<button class="pt-style-btn${italicActive}" id="teItalicBtn" onclick="this.classList.toggle('active')" title="斜体" style="font-style:italic;">I</button></div>`;

    modal.innerHTML = `
      <div class="board-edit-modal-content">
        <div class="board-edit-header">
          <h3>编辑文字</h3>
          <button onclick="BoardManager.closeEditModal()"><span class="icon"><svg><use href="#i-x"/></svg></span></button>
        </div>
        <div class="board-edit-body">${bodyHtml}</div>
        <div class="board-edit-footer">
          <button onclick="BoardManager.closeEditModal()">取消</button>
          <button class="btn-accent" onclick="BoardManager.saveTextElementEdit('${noteId}', ${unitIndex})">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  /* 保存纯文字元素编辑 */
  saveTextElementEdit(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    const oldData = JSON.parse(JSON.stringify({ content: note.content, fontSize: note.fontSize, color: note.color, bold: note.bold, italic: note.italic }));

    note.content = document.getElementById('teContent')?.value || '';
    note.fontSize = parseInt(document.getElementById('teFontSize')?.value) || 16;
    note.color = document.getElementById('teColor')?.value || '#e0d8c8';
    note.bold = document.getElementById('teBoldBtn')?.classList.contains('active') || false;
    note.italic = document.getElementById('teItalicBtn')?.classList.contains('active') || false;

    this.closeEditModal();
    // 重新渲染该元素
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) el.remove();
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (canvas) {
      this.renderNote(note, canvas, unitIndex);
    }
    this._pushUndo({ type: 'editNote', noteId: noteId, unitIndex: unitIndex, oldData: oldData, newData: JSON.parse(JSON.stringify({ content: note.content, fontSize: note.fontSize, color: note.color, bold: note.bold, italic: note.italic })) });
    this.renderMinimap();
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 删除纯文字元素 */
  deleteTextElement(noteId, unitIndex) {
    App.showConfirm('确定要删除这个文字元素吗？', '', '删除', () => {
      const units = this.getFlowUnits();
      const unit = units[unitIndex];
      if (!unit) return;
      const idx = unit.notes.findIndex(n => n.id === noteId);
      if (idx === -1) return;
      const deletedNote = unit.notes[idx];
      const savedConnections = unit.connections.filter(c => c.from === noteId || c.to === noteId);
      this._pushUndo({ type: 'deleteNote', noteId: noteId, unitIndex: unitIndex, noteData: JSON.parse(JSON.stringify(deletedNote)), connectionsData: savedConnections });
      unit.notes.splice(idx, 1);
      unit.connections = unit.connections.filter(c => c.from !== noteId && c.to !== noteId);
      const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
      if (el) el.remove();
      this.renderConnections(unitIndex);
      this.renderMinimap();
      this.saveBoard();
      StorageManager.scheduleSave();
    });
  },

  /* 从数据库放置便签到当前流程单元 */
  placeFromDatabase(dbKey, entryId, entryData) {
    const unit = this.getCurrentUnit();
    if (!unit) return;
    let entry = entryData;
    if (!entry) {
      const groupDb = this._getGroupDb();
      entry = (groupDb && groupDb[dbKey] ? groupDb[dbKey] : []).find(e => e.id === entryId);
    }
    if (!entry) return;

    // 在视口中心附近放置（使用与createNote一致的计算方式）
    const unitCanvasEl = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    let viewW = 800, viewH = 600;
    if (unitCanvasEl && unitCanvasEl.parentElement) {
      viewW = unitCanvasEl.parentElement.clientWidth;
      viewH = unitCanvasEl.parentElement.clientHeight;
    }
    const center4 = this._screenToVirtual(viewW / 2, viewH / 2);
    const vp4 = this._getUnitViewport();
    const centerX4 = center4.x + vp4.x - 100;
    const centerY4 = center4.y + vp4.y - 75;

    const title = entry.name || (entry.content || '').substring(0, 30) || '未命名';
    const note = {
      id: AppState.generateUUID(),
      type: dbKey,
      title: title,
      content: entry.content || '',
      x: centerX4 + (Math.random() * 60 - 30),
      y: centerY4 + (Math.random() * 60 - 30),
      width: 270,
      height: 150,
      used: false,
      locked: false,
      sourceEntryId: entryId,
      characterData: null,
      diceRanges: null
    };

    // 角色类型：复制数据块
    if (dbKey === 'characters' && entry.fields) {
      if (SystemManager.getCurrentSystem() === 'coc7') {
        // COC 7th：创建COC格式数据
        const cocData = _createCocCharacterData();
        cocData.name = entry.name || '';
        note.characterData = cocData;
        note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
      } else {
        // D&D 5R：从旧格式转换或直接使用新格式
        const fields = entry.fields || {};
        note.characterData = {
          name: entry.name || fields['名称'] || '',
          enName: fields['英文名称'] || '',
          size: fields['体型'] || '',
          type: fields['类型'] || '',
          alignment: fields['阵营'] || '',
          ac: fields['AC'] || fields['护甲等级'] || '',
          initiative: fields['先攻'] || '',
          hp: fields['HP'] || fields['生命值'] || '',
          speed: fields['速度'] || '',
          str: fields['力量'] || fields['STR'] || '',
          dex: fields['敏捷'] || fields['DEX'] || '',
          con: fields['体质'] || fields['CON'] || '',
          int: fields['智力'] || fields['INT'] || '',
          wis: fields['感知'] || fields['WIS'] || '',
          cha: fields['魅力'] || fields['CHA'] || '',
          skill: fields['技能'] || '',
          immune: fields['免疫'] || '',
          resistant: fields['抗性'] || '',
          senses: fields['感官'] || '',
          languages: fields['语言'] || '',
          cr: fields['CR'] || fields['挑战等级'] || '',
          traits: (() => { try { return JSON.parse(fields['_traits'] || '[]'); } catch(e) { return []; } })(),
          actions: (() => { try { return JSON.parse(fields['_actions'] || '[]'); } catch(e) { return []; } })(),
          other: fields['_other'] || '',
          fields: { ...fields }
        };
        note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
      }
    }

    // 随机遭遇/盲盒：复制范围数据
    if (dbKey === 'encounters' && entry.diceRanges) {
      // 遭遇：旧数组格式
      if (Array.isArray(entry.diceRanges)) {
        note.diceRanges = entry.diceRanges.map(r => ({ min: r.min, max: r.max, content: r.content || '' }));
      }
    } else if (dbKey === 'blindbox' && entry.diceRanges) {
      // 盲盒：新对象格式 {dieType, headers, ranges}
      if (!Array.isArray(entry.diceRanges) && entry.diceRanges.ranges) {
        note.diceRanges = {
          dieType: entry.diceRanges.dieType || 'd20',
          headers: [...(entry.diceRanges.headers || [])],
          ranges: entry.diceRanges.ranges.map(r => ({ min: r.min, max: r.max, content: r.content || '' }))
        };
      } else if (Array.isArray(entry.diceRanges)) {
        // 兼容旧数组格式
        note.diceRanges = { dieType: 'd20', headers: [], ranges: entry.diceRanges.map(r => ({ min: r.min, max: r.max, content: r.content || '' })) };
      }
    }

    this._pushUndo({ type: 'addNote', noteId: note.id, unitIndex: this.currentUnitIndex, noteData: null, connectionsData: null });
    unit.notes.push(note);
    AppState.placedEntryIds.add(entryId);
    DatabaseManager.renderDbList();
    BoardManager.renderDbList();
    // 直接创建单个便签 DOM
    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (canvas) {
      this.renderNote(note, canvas, this.currentUnitIndex);
    }
    requestAnimationFrame(() => {
      this.renderConnections(this.currentUnitIndex);
      this.renderMinimap();
    });
    if (this._dbPanelOpen && this._currentDbKey) {
      this.renderDbEntries(this._currentDbKey);
    }
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(this.currentUnitIndex);

    // 显示放置成功提示
    const cfg = DatabaseManager.getMergedDbConfig()[dbKey];
    const typeName = cfg ? cfg.name : dbKey;
    DocEditor.showToast(`已放置「${title}」到当前单元`, 'success');
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('notesPlaced', { type: dbKey, dbKey });
    }
  },

  /* 编辑便签（双击）- 弹出编辑弹窗 */
  editNote(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    if (note.type !== 'plaintext' && note.type !== 'text' && note.type !== 'encounters' && note.type !== 'blindbox') {
      return;
    }

    // 关闭已有弹窗
    this.closeEditModal();

    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'noteEditModal';

    let bodyHtml = '';

    // 内容编辑：角色类型显示完整编辑表单，随机遭遇/盲盒不显示内容编辑
    if (note.type === 'characters') {
      const d = note.characterData || {};
      bodyHtml += `<label>角色数据</label>`;
      bodyHtml += `<div id="charEditForm" style="max-height:400px;overflow-y:auto;">`;

      // 基础信息
      bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">中文名称</label><input type="text" id="charName" value="${this._esc(d.name || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">英文名称</label><input type="text" id="charEnName" value="${this._esc(d.enName || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `</div>`;

      bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">体型</label><input type="text" id="charSize" value="${this._esc(d.size || '')}" placeholder="大型" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">类型</label><input type="text" id="charType" value="${this._esc(d.type || '')}" placeholder="异怪" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">阵营（描述）</label><input type="text" id="charAlignment" value="${this._esc(d.alignment || '')}" placeholder="混乱邪恶" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">角色分类</label><select id="charFaction" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;background:var(--card);color:var(--text);">`;
      bodyHtml += `<option value="pc"${(d.faction || 'pc') === 'pc' ? ' selected' : ''}>玩家角色</option>`;
      bodyHtml += `<option value="friendly_npc"${d.faction === 'friendly_npc' ? ' selected' : ''}>友方NPC</option>`;
      bodyHtml += `<option value="enemy_npc"${d.faction === 'enemy_npc' ? ' selected' : ''}>敌方NPC</option>`;
      bodyHtml += `</select></div>`;
      bodyHtml += `</div>`;

      // 战斗数据
      bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;">`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">AC</label><input type="text" id="charAC" value="${this._esc(d.ac || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">先攻</label><input type="text" id="charInitiative" value="${this._esc(d.initiative || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">HP</label><input type="text" id="charHP" value="${this._esc(d.hp || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">速度</label><input type="text" id="charSpeed" value="${this._esc(d.speed || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `</div>`;

      // 六项属性
      bodyHtml += `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:8px;">`;
      const abLabels = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
      for (const [key, label] of Object.entries(abLabels)) {
        bodyHtml += `<div><label style="font-size:10px;color:var(--text-muted);display:block;text-align:center;">${label}</label><input type="text" id="char${key.toUpperCase()}" value="${this._esc(d[key] || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 2px;font-size:12px;text-align:center;box-sizing:border-box;"></div>`;
      }
      bodyHtml += `</div>`;

      // 其他属性
      bodyHtml += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">技能</label><input type="text" id="charSkill" value="${this._esc(d.skill || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">免疫</label><input type="text" id="charImmune" value="${this._esc(d.immune || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">抗性</label><input type="text" id="charResistant" value="${this._esc(d.resistant || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">感官</label><input type="text" id="charSenses" value="${this._esc(d.senses || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">语言</label><input type="text" id="charLanguages" value="${this._esc(d.languages || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `<div><label style="font-size:11px;color:var(--text-muted);">CR</label><input type="text" id="charCR" value="${this._esc(d.cr || '')}" style="width:100%;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"></div>`;
      bodyHtml += `</div>`;

      // 特质（动态列表）
      bodyHtml += `<label>特质</label>`;
      bodyHtml += `<div id="charTraitsList">`;
      const traits = d.traits || [];
      traits.forEach((t, i) => {
        bodyHtml += `<div class="char-trait-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        bodyHtml += `<input type="text" class="trait-title" value="${this._esc(t.title || '')}" placeholder="标题" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<input type="text" class="trait-desc" value="${this._esc(t.desc || '')}" placeholder="描述" style="flex:2;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        bodyHtml += `</div>`;
      });
      bodyHtml += `</div>`;
      bodyHtml += `<button onclick="BoardManager._addCharTraitRow()" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加特质</button>`;

      // 动作（动态列表）
      bodyHtml += `<label>动作</label>`;
      bodyHtml += `<div id="charActionsList">`;
      const actions = d.actions || [];
      actions.forEach((a, i) => {
        bodyHtml += `<div class="char-action-row" data-idx="${i}" style="display:flex;gap:6px;margin-bottom:6px;">`;
        bodyHtml += `<input type="text" class="action-title" value="${this._esc(a.title || '')}" placeholder="标题" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<input type="text" class="action-desc" value="${this._esc(a.desc || '')}" placeholder="描述" style="flex:2;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        bodyHtml += `</div>`;
      });
      bodyHtml += `</div>`;
      bodyHtml += `<button onclick="BoardManager._addCharActionRow()" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-bottom:8px;">+ 添加动作</button>`;

      // 其他
      bodyHtml += `<label>其他</label>`;
      bodyHtml += `<textarea id="charOther" style="height:80px;" placeholder="其他内容...">${this._esc(d.other || '')}</textarea>`;

      bodyHtml += `</div>`;
    } else if (note.type === 'encounters') {
      bodyHtml += `<label>内容</label>`;
      bodyHtml += `<textarea id="editNoteContent" style="height:300px;" readonly disabled placeholder="随机遭遇内容在便签上直接编辑">${this._esc(note.content || '')}</textarea>`;
    } else if (note.type === 'blindbox') {
      // 盲盒：结构化骰点范围表单
      const dr = note.diceRanges || { dieType: 'd20', headers: [], ranges: [] };
      const isNewFormat = !Array.isArray(dr) && dr.ranges;
      const dieType = isNewFormat ? (dr.dieType || 'd20') : 'd20';
      const headers = isNewFormat ? (dr.headers || []) : [];
      const ranges = isNewFormat ? dr.ranges : (Array.isArray(dr) ? dr : []);

      bodyHtml += `<label>骰子类型</label>`;
      bodyHtml += `<input type="text" id="editBxDieType" value="${this._esc(dieType)}" placeholder="如 d20" style="width:120px;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;

      bodyHtml += `<label>列标题（可选）</label>`;
      bodyHtml += `<input type="text" id="editBxHeaders" value="${this._esc(headers.join('、'))}" placeholder="如：效果、物品、遭遇" style="border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;">`;

      bodyHtml += `<label>骰点范围</label>`;
      bodyHtml += `<div id="editBxRangesList" style="max-height:300px;overflow-y:auto;">`;
      ranges.forEach((r) => {
        bodyHtml += `<div class="bx-range-row" style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">`;
        bodyHtml += `<input type="text" class="bx-range-min" value="${this._esc(String(r.min))}" placeholder="最小" style="width:50px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<span style="color:var(--text-muted);">~</span>`;
        bodyHtml += `<input type="text" class="bx-range-max" value="${this._esc(String(r.max))}" placeholder="最大" style="width:50px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<input type="text" class="bx-range-content" value="${this._esc(r.content)}" placeholder="内容" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">`;
        bodyHtml += `<button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
        bodyHtml += `</div>`;
      });
      bodyHtml += `</div>`;
      bodyHtml += `<button onclick="BoardManager._addEditBxRangeRow()" type="button" style="padding:4px 8px;font-size:11px;border:1px dashed var(--border);border-radius:4px;background:none;color:var(--text-muted);cursor:pointer;margin-top:4px;">+ 添加范围</button>`;
    } else {
      bodyHtml += `<label>内容</label>`;
      bodyHtml += `<textarea id="editNoteContent" style="height:300px;">${this._esc(note.content || '')}</textarea>`;
    }

    modal.innerHTML = `
      <div class="board-edit-modal-content">
        <div class="board-edit-header">
          <h3>编辑便签</h3>
          <button onclick="BoardManager.closeEditModal()"><span class="icon"><svg><use href="#i-x"/></svg></span></button>
        </div>
        <div class="board-edit-body">
          ${bodyHtml}
        </div>
        <div class="board-edit-footer">
          <button onclick="BoardManager.closeEditModal()">取消</button>
          <button class="btn-accent" onclick="BoardManager.saveEditModal('${note.id}', ${unitIndex})">保存</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    // 自动聚焦标题
    setTimeout(() => {
      const titleInput = document.getElementById('editNoteTitle');
      if (titleInput) { titleInput.focus(); titleInput.select(); }
    }, 100);
  },

  /* 关闭编辑弹窗 */
  closeEditModal() {
    const modal = document.getElementById('noteEditModal');
    if (modal) modal.remove();
  },

  /* 编辑便签标题（就地编辑） */
  editNoteTitle(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    this._exitNoteEdit();

    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (!el) return;

    const titleEl = el.querySelector('.note-title');
    if (!titleEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = note.title || '';
    input.className = 'note-title-input';
    input.style.width = (Math.max(titleEl.offsetWidth, 80) + 20) + 'px';

    titleEl.replaceWith(input);

    input.focus();
    input.select();

    el.classList.add('editing');
    this._editingNote = { noteId, unitIndex, mode: 'title', oldValue: note.title };

    const finishEdit = (saveFlag) => {
      if (!this._editingNote) return;
      if (saveFlag) {
        const newValue = input.value.trim() || '未命名';
        if (newValue !== this._editingNote.oldValue) {
          this._saveNoteEdit(noteId, unitIndex, { title: newValue });
        }
      }
      const newTitle = saveFlag ? (input.value.trim() || '未命名') : (note.title || '未命名');
      const newSpan = document.createElement('span');
      newSpan.className = 'note-title';
      newSpan.title = this._esc(newTitle);
      newSpan.textContent = this._esc(newTitle);
      input.replaceWith(newSpan);
      if (clickOutsideHandler) {
        document.removeEventListener('mousedown', clickOutsideHandler);
      }
      this._editingNote = null;
      el.classList.remove('editing');
    };

    const clickOutsideHandler = (e) => {
      if (!el.contains(e.target)) {
        finishEdit(true);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEdit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(false);
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (this._editingNote && this._editingNote.mode === 'title') {
          finishEdit(true);
        }
      }, 10);
    });

    setTimeout(() => {
      document.addEventListener('mousedown', clickOutsideHandler);
    }, 10);
  },

  /* 编辑便签内容（就地编辑） */
  editNoteContent(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    this._exitNoteEdit();

    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (!el) return;

    let bodyEl = el.querySelector('.note-body');
    if (!bodyEl) {
      bodyEl = document.createElement('div');
      bodyEl.className = 'note-body';
      bodyEl.innerHTML = note.content || '';
      el.appendChild(bodyEl);
    }

    bodyEl.setAttribute('contenteditable', 'true');
    bodyEl.style.outline = 'none';
    bodyEl.style.minHeight = '40px';

    el.classList.add('editing', 'editing-content');

    this._editingNote = { noteId, unitIndex, mode: 'content', oldValue: note.content };
    this.showFormatToolbar(el, bodyEl);

    const save = () => {
      if (!this._editingNote) return;
      const newValue = bodyEl.innerHTML;
      if (newValue !== this._editingNote.oldValue) {
        this._saveNoteEdit(noteId, unitIndex, { content: newValue });
      }
      this._exitNoteEdit();
    };

    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        save();
      }
    };

    const mousedownHandler = (e) => {
      e.stopPropagation();
      setTimeout(() => {
        bodyEl.focus();
      }, 0);
    };

    const mouseupHandler = (e) => {
      e.stopPropagation();
    };

    const clickOutsideHandler = (e) => {
      if (!el.contains(e.target) && !e.target.closest('.note-format-toolbar')) {
        document.removeEventListener('mousedown', clickOutsideHandler);
        save();
      }
    };

    this._editingNote.handlers = { keydownHandler, mousedownHandler, mouseupHandler, clickOutsideHandler };
    this._editingNote.bodyEl = bodyEl;
    this._editingNote.noteEl = el;

    bodyEl.addEventListener('keydown', keydownHandler);
    bodyEl.addEventListener('mousedown', mousedownHandler);
    bodyEl.addEventListener('mouseup', mouseupHandler);

    setTimeout(() => {
      document.addEventListener('mousedown', clickOutsideHandler);
      bodyEl.focus();
    }, 10);
  },

  /* 退出便签编辑状态 */
  _exitNoteEdit() {
    if (!this._editingNote) return;

    const { noteId, unitIndex, mode, handlers, bodyEl, noteEl } = this._editingNote;

    if (handlers && bodyEl) {
      bodyEl.removeEventListener('keydown', handlers.keydownHandler);
      bodyEl.removeEventListener('mousedown', handlers.mousedownHandler);
      bodyEl.removeEventListener('mouseup', handlers.mouseupHandler);
    }
    if (handlers && handlers.clickOutsideHandler) {
      document.removeEventListener('mousedown', handlers.clickOutsideHandler);
    }

    const el = noteEl || document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) {
      el.classList.remove('editing', 'editing-content');
      const body = el.querySelector('.note-body');
      if (body) {
        body.setAttribute('contenteditable', 'false');
      }
    }

    this.hideShortcutHint();
    this.hideFormatToolbar();
    this._editingNote = null;
  },

  /* 保存便签编辑（带撤销记录） */
  _saveNoteEdit(noteId, unitIndex, changes) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    const oldData = JSON.parse(JSON.stringify({ title: note.title, content: note.content }));

    if (changes.title !== undefined) note.title = changes.title;
    if (changes.content !== undefined) note.content = changes.content;

    const newData = JSON.parse(JSON.stringify({ title: note.title, content: note.content }));

    this._pushUndo({ type: 'editNote', noteId: noteId, unitIndex: unitIndex, oldData: oldData, newData: newData });

    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) {
      if (changes.title !== undefined) {
        const titleEl = el.querySelector('.note-title');
        if (titleEl) {
          titleEl.textContent = this._esc(note.title);
          titleEl.title = this._esc(note.title);
        }
      }
    }

    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 显示快捷键提示浮窗 */
  showShortcutHint(noteEl, mode) {
    this.hideShortcutHint();

    const hint = document.createElement('div');
    hint.className = 'note-shortcut-hint';
    hint.id = 'noteShortcutHint';

    if (mode === 'title') {
      hint.innerHTML = `
        <div class="hint-header">快捷键</div>
        <div class="hint-item"><kbd>Enter</kbd><span>保存退出</span></div>
        <div class="hint-item"><kbd>Alt+Enter</kbd><span>换行</span></div>
        <div class="hint-item"><kbd>Esc</kbd><span>取消</span></div>
      `;
    } else {
      hint.innerHTML = `
        <div class="hint-header">快捷键</div>
        <div class="hint-item"><kbd>Enter</kbd><span>换行</span></div>
        <div class="hint-item"><kbd>Alt+Enter</kbd><span>换行</span></div>
        <div class="hint-item"><kbd>Esc</kbd><span>保存退出</span></div>
      `;
    }

    document.body.appendChild(hint);

    const rect = noteEl.getBoundingClientRect();
    let left = rect.right + 12;
    let top = rect.top;

    if (left + 150 > window.innerWidth) {
      left = rect.left - 162;
    }

    hint.style.left = left + 'px';
    hint.style.top = top + 'px';
  },

  /* 隐藏快捷键提示浮窗 */
  hideShortcutHint() {
    const hint = document.getElementById('noteShortcutHint');
    if (hint) hint.remove();
  },

  /* 显示格式化工具栏 */
  showFormatToolbar(noteEl, bodyEl) {
    this.hideFormatToolbar();

    const toolbar = document.createElement('div');
    toolbar.className = 'note-format-toolbar';
    toolbar.id = 'noteFormatToolbar';

    const themeColors = [
      '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
      '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050',
      '#00B0F0', '#0070C0', '#002060', '#7030A0', '#FF00FF', '#FF8080'
    ];

    toolbar.innerHTML = `
      <div class="toolbar-btn" title="加粗" data-command="bold"><span style="font-weight:bold;font-size:16px;">B</span></div>
      <div class="toolbar-btn" title="斜体" data-command="italic"><span style="font-style:italic;font-size:16px;">I</span></div>
      <div class="toolbar-btn" title="下划线" data-command="underline"><span style="text-decoration:underline;font-size:16px;">U</span></div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-btn color-btn" title="文字颜色">
        <div class="color-preview-box" style="background-color:#000000;"></div>
        <div class="color-picker" style="display:none;">
          <div class="color-picker-close" title="关闭">&times;</div>
          <div class="color-section">
            <div class="color-section-title">主题颜色</div>
            <div class="color-grid">
              ${themeColors.map(c => `<div class="color-cell" data-color="${c}" style="background-color:${c};"></div>`).join('')}
            </div>
          </div>
          <div class="color-section">
            <div class="color-section-title">标准颜色</div>
            <div class="color-grid">
              <div class="color-cell" data-color="#FF0000" style="background-color:#FF0000;"></div>
              <div class="color-cell" data-color="#FF8C00" style="background-color:#FF8C00;"></div>
              <div class="color-cell" data-color="#FFD700" style="background-color:#FFD700;"></div>
              <div class="color-cell" data-color="#008000" style="background-color:#008000;"></div>
              <div class="color-cell" data-color="#0000FF" style="background-color:#0000FF;"></div>
              <div class="color-cell" data-color="#800080" style="background-color:#800080;"></div>
              <div class="color-cell" data-color="#000000" style="background-color:#000000;"></div>
              <div class="color-cell" data-color="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #ccc;"></div>
            </div>
          </div>
          <div class="color-input-row">
            <input type="text" class="color-input" placeholder="#FF0000">
            <input type="color" class="color-picker-input">
            <button class="color-confirm">确认</button>
          </div>
          <div class="color-clear">清除格式</div>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="font-size-row">
        <button class="toolbar-btn font-size-btn" title="缩小字号" data-action="decSize">&minus;</button>
        <span class="font-size-display">14</span>
        <button class="toolbar-btn font-size-btn" title="增大字号" data-action="incSize">+</button>
        <span class="font-size-unit">px</span>
      </div>
    `;

    document.body.appendChild(toolbar);

    // === 工具栏选区全局防护 ===
    // 捕获阶段在浏览器切换焦点前拍快照保存选区，供各处理器恢复使用
    let _savedToolbarRange = null;
    toolbar.addEventListener('pointerdown', (e) => {
      const saved = this._saveSelection();
      if (saved && !saved.collapsed) {
        _savedToolbarRange = saved;
      }
    }, true);

    const rect = noteEl.getBoundingClientRect();
    let left = rect.left + 2;
    let top = rect.top - 50;

    if (left < 10) {
      left = rect.right + 10;
    }

    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';

    const colorBtn = toolbar.querySelector('.color-btn');
    const picker = toolbar.querySelector('.color-picker');
    const colorCells = picker.querySelectorAll('.color-cell');
    const colorInput = picker.querySelector('.color-input');
    const colorPickerInput = picker.querySelector('.color-picker-input');
    const colorConfirm = picker.querySelector('.color-confirm');
    const colorClear = picker.querySelector('.color-clear');
    const colorPreviewBox = toolbar.querySelector('.color-preview-box');
    const formatBtns = toolbar.querySelectorAll('.toolbar-btn[data-command]');

    formatBtns.forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const command = btn.getAttribute('data-command');
        this._formatText(command, _savedToolbarRange);
      });
    });

    colorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });

    picker.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    colorCells.forEach(cell => {
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = cell.getAttribute('data-color');
        this._setColor(color, _savedToolbarRange);
        colorPreviewBox.style.backgroundColor = color;
        picker.style.display = 'none';
      });
    });

    colorPickerInput.addEventListener('change', (e) => {
      e.stopPropagation();
      const color = e.target.value;
      this._setColor(color, _savedToolbarRange);
      colorPreviewBox.style.backgroundColor = color;
      colorInput.value = color;
      picker.style.display = 'none';
    });

    colorPickerInput.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    colorInput.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    colorInput.addEventListener('input', (e) => {
      e.stopPropagation();
      const color = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        colorPreviewBox.style.backgroundColor = color;
      }
    });

    colorConfirm.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const color = colorInput.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        this._setColor(color, _savedToolbarRange);
        colorPreviewBox.style.backgroundColor = color;
        picker.style.display = 'none';
      }
    });

    colorClear.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._clearFormat(_savedToolbarRange);
      picker.style.display = 'none';
    });

    const colorClose = picker.querySelector('.color-picker-close');
    colorClose.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      picker.style.display = 'none';
    });

    // 字体大小 +/- 按钮
    const fontSizeBtns = toolbar.querySelectorAll('.font-size-btn');
    const fontSizeDisplay = toolbar.querySelector('.font-size-display');

    const updateSizeDisplay = () => {
      if (!_savedToolbarRange || _savedToolbarRange.collapsed) {
        fontSizeDisplay.textContent = '14';
        return;
      }
      const sizes = this._getFontSizesFromRange(_savedToolbarRange);
      if (sizes.length === 0) {
        fontSizeDisplay.textContent = '14';
      } else if (sizes.length === 1) {
        fontSizeDisplay.textContent = sizes[0];
      } else {
        fontSizeDisplay.textContent = '?';
      }
    };
    updateSizeDisplay();

    fontSizeBtns.forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!_savedToolbarRange || _savedToolbarRange.collapsed) return;

        const sizes = this._getFontSizesFromRange(_savedToolbarRange);
        if (sizes.length === 0) return;

        const action = btn.getAttribute('data-action');
        const delta = action === 'incSize' ? 1 : -1;
        let newRange;

        if (sizes.length === 1) {
          const newSize = Math.max(1, Math.min(200, sizes[0] + delta));
          newRange = this._applyFontSizeToRange(_savedToolbarRange, newSize);
          if (newRange) fontSizeDisplay.textContent = newSize;
        } else {
          newRange = this._adjustMixedFontSizes(_savedToolbarRange, delta);
          if (newRange) {
            const newSizes = this._getFontSizesFromRange(newRange);
            fontSizeDisplay.textContent = newSizes.length === 1 ? newSizes[0] : '?';
          }
        }

        if (newRange) {
          _savedToolbarRange = newRange;
          const bodyEl = document.querySelector('.note-body[contenteditable="true"]');
          if (bodyEl) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(newRange.cloneRange());
          }
        }
      });
    });

    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.note-format-toolbar')) {
        picker.style.display = 'none';
      }
    });

    // 注册选区变化监听器，通过 rAF 节流避免密集触发干扰 contenteditable 输入
    this._toolbarRafId = null;
    this._toolbarSelectionHandler = () => {
      if (this._toolbarRafId) return;
      this._toolbarRafId = requestAnimationFrame(() => {
        this._toolbarRafId = null;
        this._updateToolbarState();
      });
    };
    document.addEventListener('selectionchange', this._toolbarSelectionHandler);
    // 初始化一次状态
    setTimeout(() => this._updateToolbarState(), 50);
  },

  /* 隐藏格式化工具栏 */
  hideFormatToolbar() {
    if (this._toolbarRafId) {
      cancelAnimationFrame(this._toolbarRafId);
      this._toolbarRafId = null;
    }
    if (this._toolbarSelectionHandler) {
      document.removeEventListener('selectionchange', this._toolbarSelectionHandler);
      this._toolbarSelectionHandler = null;
    }
    const toolbar = document.getElementById('noteFormatToolbar');
    if (toolbar) toolbar.remove();
  },

  /* 保存当前选区 */
  _saveSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      return selection.getRangeAt(0).cloneRange();
    }
    return null;
  },

  /* 恢复选区 */
  _restoreSelection(range) {
    if (range) {
      try {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (e) {}
    }
  },

  /* 格式化文本 */
  _formatText(command, savedRange) {
    const bodyEl = document.querySelector('.note-body[contenteditable="true"]');
    if (!bodyEl) return;
    const range = savedRange || this._saveSelection();
    bodyEl.focus();
    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand(command, false, null);
    // 不恢复旧 Range：execCommand 后 DOM 已变化，旧 Range 的节点引用已失效，
    // 恢复会破坏 execCommand 留下的正确选区。让浏览器自然保留 execCommand 后的选区。
    bodyEl.focus();
    this._updateToolbarState();
  },

  /* 设置文字颜色 */
  _setColor(color, savedRange) {
    if (!color) return;
    const bodyEl = document.querySelector('.note-body[contenteditable="true"]');
    if (!bodyEl) return;
    const range = savedRange || this._saveSelection();
    bodyEl.focus();
    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('foreColor', false, color);
    bodyEl.focus();
    this._updateToolbarState();
  },

  /* 清除格式 */
  _clearFormat(savedRange) {
    const bodyEl = document.querySelector('.note-body[contenteditable="true"]');
    if (!bodyEl) return;
    const range = savedRange || this._saveSelection();
    bodyEl.focus();
    if (range) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('removeFormat', false, null);
    bodyEl.focus();
    this._updateToolbarState();
  },

  /* 设置字体大小 */
  _setFontSize(size) {
    if (!size || size <= 0) return;
    const bodyEl = document.querySelector('.note-body[contenteditable="true"]');
    if (!bodyEl) return;
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    
    // 如果选区已折叠（没有选中文字），应用到整个正文
    let targetRange;
    if (range.collapsed) {
      targetRange = document.createRange();
      targetRange.selectNodeContents(bodyEl);
    } else {
      targetRange = range;
    }
    
    // 用 span 包裹选区内容，设置 font-size
    const span = document.createElement('span');
    span.style.fontSize = size + 'px';
    
    try {
      // 提取选区内容放入 span
      span.appendChild(targetRange.extractContents());
      targetRange.insertNode(span);
    } catch (e) {
      // extractContents 失败时的兜底：使用 surroundContents
      try {
        targetRange.surroundContents(span);
      } catch (e2) {
        return;
      }
    }
    
    // 恢复选区到 span 内部
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    selection.addRange(newRange);
    
    bodyEl.focus();
    this._updateToolbarState();
  },

  /* 从 Range 中获取所有字号 */
  _getFontSizesFromRange(range) {
    const sizes = new Set();
    let root = range.commonAncestorContainer;
    if (root.nodeType === 3) root = root.parentElement;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let textNode;
    while (textNode = walker.nextNode()) {
      if (range.intersectsNode(textNode)) {
        const el = textNode.parentElement;
        if (el) {
          const fs = window.getComputedStyle(el).fontSize;
          sizes.add(parseInt(fs));
        }
      }
    }
    return Array.from(sizes);
  },

  /* 用 Range 直接设置字号（不依赖选区），返回新的 Range */
  _applyFontSizeToRange(range, size) {
    if (!size || size <= 0) return null;
    if (range.collapsed) return null;

    // 快捷路径：如果 Range 完全在一个已有 fontSize 的 span 内，直接改样式，避免 extractContents 抛异常
    const commonAnc = range.commonAncestorContainer;
    let el = commonAnc.nodeType === 1 ? commonAnc : commonAnc.parentElement;
    while (el && el !== document.body && el.nodeType === 1) {
      if (el.tagName === 'SPAN' && el.style.fontSize) {
        const innerRange = document.createRange();
        innerRange.selectNodeContents(el);
        if (range.compareBoundaryPoints(Range.START_TO_START, innerRange) === 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, innerRange) === 0) {
          el.style.fontSize = size + 'px';
          const nr = document.createRange();
          nr.selectNodeContents(el);
          return nr;
        }
      }
      el = el.parentElement;
    }

    const span = document.createElement('span');
    span.style.fontSize = size + 'px';

    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch (e) {
      try {
        range.surroundContents(span);
      } catch (e2) {
        return null;
      }
    }

    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    return newRange;
  },

  /* 多字号场景：各自调整 fontSize span 的差值，不统一覆盖 */
  _adjustMixedFontSizes(range, delta) {
    if (!range || range.collapsed) return null;

    let root = range.commonAncestorContainer;
    if (root.nodeType === 3) root = root.parentElement;
    if (!root) return null;

    // 克隆 Range（DOM 可能会变，先保存原始选区位置）
    const originalRange = range.cloneRange();
    const doc = root.ownerDocument;

    // 第一遍：原地调整已有的 fontSize SPAN
    const elemWalker = doc.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      },
      false
    );
    let node;
    while (node = elemWalker.nextNode()) {
      if (node.tagName === 'SPAN' && node.style.fontSize) {
        const cur = parseInt(node.style.fontSize);
        if (cur > 0) {
          node.style.fontSize = Math.max(1, Math.min(200, cur + delta)) + 'px';
        }
      }
    }

    // 第二遍：收集裸文本节点（未被 fontSize SPAN 包裹的）
    const bareTextNodes = [];
    const textWalker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    while (node = textWalker.nextNode()) {
      if (!node.textContent.trim()) continue;
      if (!range.intersectsNode(node)) continue;
      let inside = false;
      let p = node.parentElement;
      while (p && p !== root) {
        if (p.tagName === 'SPAN' && p.style.fontSize) { inside = true; break; }
        p = p.parentElement;
      }
      if (inside) continue;
      bareTextNodes.push(node);
    }

    // 第三遍：从后往前包裹裸文本（避免位置偏移影响前面的节点）
    for (let i = bareTextNodes.length - 1; i >= 0; i--) {
      const textNode = bareTextNodes[i];
      const parent = textNode.parentElement;
      if (!parent) continue;

      const computedSize = getComputedStyle(parent).fontSize;
      const curInt = parseInt(computedSize);
      if (curInt <= 0) continue;

      const newSize = Math.max(1, Math.min(200, curInt + delta)) + 'px';

      const isStart = (originalRange.startContainer === textNode);
      const isEnd = (originalRange.endContainer === textNode);
      const startOff = isStart ? originalRange.startOffset : 0;
      const endOff = isEnd ? originalRange.endOffset : textNode.length;

      if (startOff === 0 && endOff === textNode.length) {
        // 整个文本节点都在选区内，直接包裹
        const span = doc.createElement('span');
        span.style.fontSize = newSize;
        parent.insertBefore(span, textNode);
        span.appendChild(textNode);
      } else {
        // 部分选中：先切尾部再切头部，拿到中间段包裹
        if (endOff < textNode.length) {
          textNode.splitText(endOff);
        }
        const midNode = startOff > 0 ? textNode.splitText(startOff) : textNode;
        if (midNode.length > 0) {
          const span = doc.createElement('span');
          span.style.fontSize = newSize;
          parent.insertBefore(span, midNode);
          span.appendChild(midNode);
        }
      }
    }

    // 尝试恢复原始选区；若 DOM 变动导致失败则退回到克隆 Range
    return originalRange;
  },

  /* 更新工具栏状态（根据当前选区） */
  _updateToolbarState() {
    const toolbar = document.getElementById('noteFormatToolbar');
    if (!toolbar) return;
    
    const boldBtn = toolbar.querySelector('[data-command="bold"]');
    const italicBtn = toolbar.querySelector('[data-command="italic"]');
    const underlineBtn = toolbar.querySelector('[data-command="underline"]');
    const colorPreviewBox = toolbar.querySelector('.color-preview-box');
    const fontSizeDisplay = toolbar.querySelector('.font-size-display');
    
    // 检测加粗/斜体/下划线状态
    try {
      if (boldBtn) {
        const isBold = document.queryCommandState('bold');
        boldBtn.classList.toggle('active', isBold);
      }
      if (italicBtn) {
        const isItalic = document.queryCommandState('italic');
        italicBtn.classList.toggle('active', isItalic);
      }
      if (underlineBtn) {
        const isUnderline = document.queryCommandState('underline');
        underlineBtn.classList.toggle('active', isUnderline);
      }
    } catch (e) {}
    
    // 检测当前颜色
    if (colorPreviewBox) {
      try {
        const color = document.queryCommandValue('foreColor');
        if (color && color !== 'rgb(0, 0, 0)' && color !== '#000000') {
          colorPreviewBox.style.backgroundColor = color;
        } else {
          colorPreviewBox.style.backgroundColor = '#000000';
        }
      } catch (e) {}
    }
    
    // 检测当前字号
    if (fontSizeDisplay) {
      try {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && !selection.isCollapsed) {
          const range = selection.getRangeAt(0);
          const sizes = this._getFontSizesFromRange(range);
          if (sizes.length === 1) {
            fontSizeDisplay.textContent = sizes[0];
          } else if (sizes.length > 1) {
            fontSizeDisplay.textContent = '?';
          } else {
            let node = selection.anchorNode;
            if (node && node.nodeType === 3) node = node.parentElement;
            if (node) {
              const fs = parseInt(window.getComputedStyle(node).fontSize);
              if (fs > 0) fontSizeDisplay.textContent = fs;
            }
          }
        }
      } catch (e) {}
    }
  },

  /* 保存编辑弹窗 */
  saveEditModal(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    const oldData = JSON.parse(JSON.stringify({ title: note.title, content: note.content, characterData: note.characterData, diceRanges: note.diceRanges }));

    const titleInput = document.getElementById('editNoteTitle');
    const contentTextarea = document.getElementById('editNoteContent');

    if (titleInput) note.title = titleInput.value || '未命名';

    if (note.type === 'characters') {
      // COC角色不走D&D表单覆盖，由_saveCocInlineEdit单独处理
      if (note.characterData && note.characterData._coc7) {
        // 仅同步标题
        if (note.characterData.name) note.title = note.characterData.name;
      } else {
      // 从表单收集角色数据
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      const traits = [];
      document.querySelectorAll('#charTraitsList .char-trait-row').forEach(row => {
        const title = row.querySelector('.trait-title')?.value.trim() || '';
        const desc = row.querySelector('.trait-desc')?.value.trim() || '';
        if (title || desc) traits.push({ title, desc });
      });

      const actions = [];
      document.querySelectorAll('#charActionsList .char-action-row').forEach(row => {
        const title = row.querySelector('.action-title')?.value.trim() || '';
        const desc = row.querySelector('.action-desc')?.value.trim() || '';
        if (title || desc) actions.push({ title, desc });
      });

      note.characterData = {
        name: getVal('charName'),
        enName: getVal('charEnName'),
        size: getVal('charSize'),
        type: getVal('charType'),
        alignment: getVal('charAlignment'),
        faction: getVal('charFaction') || 'pc',
        ac: getVal('charAC'),
        initiative: getVal('charInitiative'),
        hp: getVal('charHP'),
        speed: getVal('charSpeed'),
        str: getVal('charSTR'),
        dex: getVal('charDEX'),
        con: getVal('charCON'),
        int: getVal('charINT'),
        wis: getVal('charWIS'),
        cha: getVal('charCHA'),
        skill: getVal('charSkill'),
        immune: getVal('charImmune'),
        resistant: getVal('charResistant'),
        senses: getVal('charSenses'),
        languages: getVal('charLanguages'),
        cr: getVal('charCR'),
        traits: traits,
        actions: actions,
        other: getVal('charOther'),
        fields: note.characterData.fields || {}
      };
      // 确保战斗追踪器已初始化（兼容旧便签）
      if (!note.combatTracker) {
        note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
      }
      // 同步HP到战斗面板
      const oldMaxHp = note.combatTracker.maxHp;
      const newMaxHp = this._parseMaxHp(note.characterData);
      if (newMaxHp && newMaxHp !== oldMaxHp) {
        note.combatTracker.maxHp = newMaxHp;
        note.combatTracker.currentHp = newMaxHp;
      }
      // 同步标题
      if (note.characterData.name) note.title = note.characterData.name;
      } // end D&D path
    } else if (note.type === 'blindbox') {
      // 从表单收集盲盒骰点范围数据
      const dieTypeEl = document.getElementById('editBxDieType');
      const headersEl = document.getElementById('editBxHeaders');
      
      const dieType = dieTypeEl ? dieTypeEl.value : 'd20';
      const headersStr = headersEl ? headersEl.value.trim() : '';
      const headers = headersStr ? headersStr.split(/[、,]/).map(h => h.trim()).filter(Boolean) : [];
      
      const ranges = [];
      document.querySelectorAll('#editBxRangesList .bx-range-row').forEach(row => {
        const minEl = row.querySelector('.bx-range-min');
        const maxEl = row.querySelector('.bx-range-max');
        const contentEl = row.querySelector('.bx-range-content');
        const min = parseInt(minEl ? minEl.value.trim() : '1') || 1;
        const max = parseInt(maxEl ? maxEl.value.trim() : '5') || 5;
        const content = contentEl ? contentEl.value.trim() : '';
        ranges.push({ min, max, content });
      });
      
      note.diceRanges = {
        dieType: dieType,
        headers: headers,
        ranges: ranges
      };
    } else if (contentTextarea && note.type !== 'encounters') {
      note.content = contentTextarea.value;
    }

    this.closeEditModal();
    // 直接更新单个便签 DOM，不重新渲染所有
    const oldEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (oldEl) oldEl.remove();
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (canvas) {
      this.renderNote(note, canvas, unitIndex);
    }
    this.renderThumbnails();
    this._pushUndo({ type: 'editNote', noteId: noteId, unitIndex: unitIndex, oldData: oldData, newData: JSON.parse(JSON.stringify({ title: note.title, content: note.content, characterData: note.characterData, diceRanges: note.diceRanges })) });
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 删除便签 */
  deleteNote(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;

    const noteIdx = unit.notes.findIndex(n => n.id === noteId);
    if (noteIdx === -1) return;
    const note = unit.notes[noteIdx];

    // 锁定便签删除需要确认
    if (note.locked) {
      App.showConfirm('删除锁定便签', `「${note.title || '未命名'}」已锁定，确定要删除吗？`, '删除', () => {
        this._doDeleteNote(unit, note, noteIdx, noteId, unitIndex);
      });
      return;
    }

    this._doDeleteNote(unit, note, noteIdx, noteId, unitIndex);
  },

  /* 实际执行删除（供 deleteNote 和 deleteContextNote 共用） */
  _doDeleteNote(unit, note, noteIdx, noteId, unitIndex) {
    // 退出编辑状态
    this._exitNoteEdit();

    const units = this.getFlowUnits();
    // 记录撤回信息
    const savedConnections = unit.connections.filter(c => c.from === noteId || c.to === noteId);
    this._pushUndo({ type: 'deleteNote', noteId: noteId, unitIndex: unitIndex, noteData: JSON.parse(JSON.stringify(note)), connectionsData: savedConnections });
    // 移除关联连线
    unit.connections = unit.connections.filter(c => c.from !== noteId && c.to !== noteId);
    unit.notes.splice(noteIdx, 1);
    // 更新 placedEntryIds
    if (note.sourceEntryId) {
      let stillUsed = false;
      for (const u of units) {
        if (u.notes.some(n => n.sourceEntryId === note.sourceEntryId)) {
          stillUsed = true;
          break;
        }
      }
      if (!stillUsed) AppState.placedEntryIds.delete(note.sourceEntryId);
    }
    DatabaseManager.renderDbList();
    BoardManager.renderDbList();
    // 直接移除单个 DOM 元素，不重新渲染所有便签
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) el.remove();
    // 重新渲染连线和鸟瞰图
    this.renderConnections(unitIndex);
    this.renderMinimap();
    if (this._dbPanelOpen && this._currentDbKey) {
      this.renderDbEntries(this._currentDbKey);
    }
    this.saveBoard();
    StorageManager.scheduleSave();
    this._updateEmptyPrompt(unitIndex);
  },

  /* 标记已使用 */
  toggleNoteUsed(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;
    this._pushUndo({ type: 'toggleUsed', noteId: noteId, unitIndex: unitIndex });
    note.used = !note.used;
    // 直接操作 DOM，不重新渲染所有便签
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) {
      el.classList.toggle('used', note.used);
    }
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 切换便签锁定 */
  toggleNoteLock(noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;
    this._pushUndo({ type: 'toggleLock', noteId: noteId, unitIndex: unitIndex });
    note.locked = !note.locked;
    // 直接操作 DOM
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) {
      el.classList.toggle('locked', note.locked);
      const btn = el.querySelector('.lock-btn');
      if (btn) {
        btn.classList.toggle('locked', note.locked);
        btn.title = note.locked ? '已锁定' : '点击锁定位置';
      }
    }
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 开始拉伸便签 */
  startResize(e, noteId, unitIndex) {
    e.preventDefault();
    const noteEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (!noteEl) return;

    if (e.pointerId != null) {
      noteEl.setPointerCapture(e.pointerId);
      this._activePointerTarget = noteEl;
      this._activePointerId = e.pointerId;
    }

    const rect = noteEl.getBoundingClientRect();
    this._isResizing = true;
    this._resizeNoteId = noteId;
    this._resizeUnitIndex = unitIndex;
    this._resizeStartSize = { w: rect.width, h: rect.height };
    this._resizeStartPos = { x: e.clientX, y: e.clientY };
    noteEl.classList.add('resizing');
  },

  /* ==================== 便签拖放 ==================== */

  /* 获取元素的虚拟尺寸 */
  _getNoteSize(note) {
    if (note.type === 'text') return { w: note.width || 100, h: note.height || 24 };
    if (note.type === 'plaintext') return { w: note.width || 300, h: note.height || 120 };
    if (note.type === 'battle') return { w: note.width || 280, h: 220 };
    return { w: note.width || 200, h: 80 };
  },

  /* 吸附对齐：将拖拽元素吸附到附近元素的边缘 */
  _snapNotePosition(note, unitIndex, threshold = 8) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return { x: false, y: false };

    const ds = this._getNoteSize(note);
    const dw = ds.w, dh = ds.h;

    let bestSnapX = null, bestSnapY = null;
    let minDistX = threshold, minDistY = threshold;

    for (const other of unit.notes) {
      if (!other || other.id === note.id || other.locked) continue;

      const os = this._getNoteSize(other);
      const ow = os.w, oh = os.h;

      // 水平吸附：left-to-left / left-to-right / right-to-left / right-to-right / centerX
      const hPairs = [
        { de: note.x, te: other.x },
        { de: note.x, te: other.x + ow },
        { de: note.x + dw, te: other.x },
        { de: note.x + dw, te: other.x + ow },
        { de: note.x + dw / 2, te: other.x + ow / 2 }
      ];
      for (const { de, te } of hPairs) {
        const dist = Math.abs(de - te);
        if (dist < minDistX) {
          minDistX = dist;
          bestSnapX = te - (de - note.x);
        }
      }

      // 垂直吸附：top-to-top / top-to-bottom / bottom-to-top / bottom-to-bottom / centerY
      const vPairs = [
        { de: note.y, te: other.y },
        { de: note.y, te: other.y + oh },
        { de: note.y + dh, te: other.y },
        { de: note.y + dh, te: other.y + oh },
        { de: note.y + dh / 2, te: other.y + oh / 2 }
      ];
      for (const { de, te } of vPairs) {
        const dist = Math.abs(de - te);
        if (dist < minDistY) {
          minDistY = dist;
          bestSnapY = te - (de - note.y);
        }
      }
    }

    if (bestSnapX !== null) note.x = bestSnapX;
    if (bestSnapY !== null) note.y = bestSnapY;

    return { x: bestSnapX !== null, y: bestSnapY !== null };
  },

  startNoteDrag(e, noteId, unitIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;
    if (note.locked) return;

    const noteEl = e.target.closest('.note-card, .plain-text-block, .canvas-text-el, .canvas-image');
    if (!noteEl) return;

    if (noteEl.classList.contains('editing')) return;

    e.preventDefault();

    if (e.pointerId != null) {
      noteEl.setPointerCapture(e.pointerId);
      this._activePointerTarget = noteEl;
      this._activePointerId = e.pointerId;
    }

    this.isDragging = true;
    this._dragUndoPushed = false; // 标记是否已记录撤回
    this.dragNoteId = noteId;
    this.dragUnitIndex = unitIndex;
    this.dragNote = note;
    this._dragStartVirtual = { x: note.x, y: note.y };
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    const canvasRect = canvas.getBoundingClientRect();

    // 记录拖拽起始屏幕坐标（用于多选批量拖拽）
    this._dragStartScreen = {
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top
    };

    // 检查是否多选拖拽
    if (this._selectedNoteIds.has(noteId) && this._selectedNoteIds.size > 1) {
      this._isMultiDrag = true;
      this._multiDragNotes = [];
      for (const id of this._selectedNoteIds) {
        const n = unit.notes.find(n => n.id === id);
        if (n && !n.locked) {
          this._multiDragNotes.push({ noteId: id, note: n, startX: n.x, startY: n.y });
          const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${id}"]`);
          if (el) el.classList.add('dragging');
        }
      }
    } else {
      this._isMultiDrag = false;
      this._multiDragNotes = [];
      // 使用虚拟坐标计算拖拽偏移，避免 getBoundingClientRect 在缩放/变换下的误差
      const s = this.scale || 1;
      const mouseScreenX = e.clientX - canvasRect.left;
      const mouseScreenY = e.clientY - canvasRect.top;
      const mouseVX = mouseScreenX / s;
      const mouseVY = mouseScreenY / s;
      this.dragOffset.x = (mouseVX - note.x) * s;
      this.dragOffset.y = (mouseVY - note.y) * s;
      noteEl.classList.add('dragging');
    }
  },

  _onGlobalPointerMove(e) {
    if (AppState.currentPage !== 'board') return;
    // 画布平移
    if (this._isCanvasPanning) {
      const dx = e.clientX - this._panStart.x;
      const dy = e.clientY - this._panStart.y;
      const s = this.scale || 1;
      this._setUnitViewport(
        this._panStartViewport.x - dx / s,
        this._panStartViewport.y - dy / s
      );
      return;
    }

    // 框选更新
    if (this._isSelecting) {
      const canvas = document.getElementById('unitCanvas_' + this._selectionCanvasIndex);
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const vEnd = this._screenToVirtual(e.clientX - rect.left, e.clientY - rect.top, this._selectionCanvasIndex);
        this._selectionEnd = vEnd;
        this._updateSelectionBox();
      }
      return;
    }

    // 处理拉伸
    if (this._isResizing) {
      const s = this.scale || 1;
      const dx = e.clientX - this._resizeStartPos.x;
      const dy = e.clientY - this._resizeStartPos.y;
      let newW = Math.max(60, (this._resizeStartSize.w + dx) / s);
      let newH = Math.max(60, (this._resizeStartSize.h + dy) / s);

      // Shift 按住时等比缩放
      if (e.shiftKey && this._resizeStartSize.w > 0 && this._resizeStartSize.h > 0) {
        const aspect = this._resizeStartSize.w / this._resizeStartSize.h;
        // 以变化量较大的维度为基准
        if (Math.abs(dx) > Math.abs(dy)) {
          newH = newW / aspect;
        } else {
          newW = newH * aspect;
        }
      }

      const units = this.getFlowUnits();
      const unit = units[this._resizeUnitIndex];
      if (unit) {
        const note = unit.notes.find(n => n.id === this._resizeNoteId);
        if (note) {
          note.width = newW;
          note.height = newH;
        }
      }
      const noteEl = document.querySelector(`#unitCanvas_${this._resizeUnitIndex} [data-note-id="${this._resizeNoteId}"]`);
      if (noteEl) {
        noteEl.style.width = newW + 'px';
        noteEl.style.height = newH + 'px';
      }
      // 拉伸时实时更新连线端点（保持中心点）
      this.renderConnections(this._resizeUnitIndex);
      return;
    }

    // 便签拖拽
    if (!this.isDragging || !this.dragNote) return;

    const canvas = document.getElementById('unitCanvas_' + this.dragUnitIndex);
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    // 计算鼠标在画布上的屏幕坐标
    const screenX = e.clientX - canvasRect.left;
    const screenY = e.clientY - canvasRect.top;

    if (this._isMultiDrag && this._multiDragNotes.length > 0) {
      // 批量拖拽
      const deltaX = screenX - this._dragStartScreen.x;
      const deltaY = screenY - this._dragStartScreen.y;
      const s = this.scale || 1;
      for (const item of this._multiDragNotes) {
        const note = item.note;
        note.x = item.startX + deltaX / s;
        note.y = item.startY + deltaY / s;
        this._snapNotePosition(note, this.dragUnitIndex);
        const el = document.querySelector(`#unitCanvas_${this.dragUnitIndex} [data-note-id="${item.noteId}"]`);
        if (el) {
          el.style.left = note.x + 'px';
          el.style.top = note.y + 'px';
        }
      }
      this.renderConnections(this.dragUnitIndex);
      this.renderMinimap();
    } else {
      // 单个拖拽
      const virtualPos = this._screenToVirtual(screenX - this.dragOffset.x, screenY - this.dragOffset.y, this.dragUnitIndex);
      this.dragNote.x = virtualPos.x;
      this.dragNote.y = virtualPos.y;
      this._snapNotePosition(this.dragNote, this.dragUnitIndex);
      const noteEl = document.querySelector(`#unitCanvas_${this.dragUnitIndex} [data-note-id="${this.dragNoteId}"]`);
      if (noteEl) {
        noteEl.style.left = this.dragNote.x + 'px';
        noteEl.style.top = this.dragNote.y + 'px';
      }
      this.renderConnections(this.dragUnitIndex);
      this.renderMinimap();
    }
  },

  _onGlobalPointerUp(e) {
    if (AppState.currentPage !== 'board') return;
    // 清除多选拖拽状态
    if (this._isMultiDrag) {
      document.querySelectorAll('.note-card.dragging, .plain-text-block.dragging, .canvas-text-el.dragging, .canvas-image.dragging').forEach(el => el.classList.remove('dragging'));
      this._isMultiDrag = false;
      this._multiDragNotes = [];
    }

    // 处理拖拽结束（优先于框选）
    if (this.isDragging) {
      const noteEl = document.querySelector(`[data-note-id="${this.dragNoteId}"]`);
      if (noteEl) noteEl.classList.remove('dragging');
      // 记录拖拽撤回
      if (!this._dragUndoPushed && this._dragStartVirtual && this.dragNote) {
        this._pushUndo({ type: 'moveNote', noteId: this.dragNoteId, unitIndex: this.dragUnitIndex, oldX: this._dragStartVirtual.x, oldY: this._dragStartVirtual.y, newX: this.dragNote.x, newY: this.dragNote.y });
      }
      this.isDragging = false;
      this.dragNote = null;
      this.dragNoteId = null;
      this.saveBoard();
      StorageManager.scheduleSave();
    }

    // 处理框选结束
    if (this._isSelecting) {
      this._finishSelection();
      this._isSelecting = false;
      const box = document.getElementById('selectionBox');
      if (box) box.remove();
      return;
    }

    // 处理拉伸结束
    if (this._isResizing) {
      this._isResizing = false;
      const resizeUnitIdx = this._resizeUnitIndex;
      const noteEl = document.querySelector(`[data-note-id="${this._resizeNoteId}"]`);
      if (noteEl) noteEl.classList.remove('resizing');
      this._resizeNoteId = null;
      this._resizeUnitIndex = -1;
      // 拉伸结束后更新连线端点
      this.renderConnections(resizeUnitIdx);
      this.saveBoard();
      StorageManager.scheduleSave();
      return;
    }

    // 画布平移结束
    if (this._isCanvasPanning) {
      this._isCanvasPanning = false;
      document.body.style.cursor = '';
    }

    // 释放 pointer capture
    if (this._activePointerTarget && this._activePointerId != null) {
      try { this._activePointerTarget.releasePointerCapture(this._activePointerId); } catch (e) {}
      this._activePointerTarget = null;
      this._activePointerId = null;
    }
  },

  /* ==================== 框选 ==================== */

  /* 更新选择框位置 */
  _updateSelectionBox() {
    const box = document.getElementById('selectionBox');
    if (!box) return;
    const minX = Math.min(this._selectionStart.x, this._selectionEnd.x);
    const minY = Math.min(this._selectionStart.y, this._selectionEnd.y);
    const maxX = Math.max(this._selectionStart.x, this._selectionEnd.x);
    const maxY = Math.max(this._selectionStart.y, this._selectionEnd.y);

    // 选框是 canvas 子元素，canvas 的 CSS transform 自动将虚拟坐标映射为屏幕坐标
    box.style.left = minX + 'px';
    box.style.top = minY + 'px';
    box.style.width = (maxX - minX) + 'px';
    box.style.height = (maxY - minY) + 'px';
  },

  /* 完成框选 - 检测相交便签 */
  _finishSelection() {
    const units = this.getFlowUnits();
    const unit = units[this._selectionCanvasIndex];
    if (!unit) return;

    const minX = Math.min(this._selectionStart.x, this._selectionEnd.x);
    const minY = Math.min(this._selectionStart.y, this._selectionEnd.y);
    const maxX = Math.max(this._selectionStart.x, this._selectionEnd.x);
    const maxY = Math.max(this._selectionStart.y, this._selectionEnd.y);

    for (const note of unit.notes) {
      const nx = note.x;
      const ny = note.y;
      const nw = note.width || 200;
      const nh = note.type === 'text' ? (note.height || 30) : 80;
      if (nx < maxX && nx + nw > minX && ny < maxY && ny + nh > minY) {
        this._selectedNoteIds.add(note.id);
      }
    }

    const canvas = document.getElementById('unitCanvas_' + this._selectionCanvasIndex);
    if (canvas) {
      canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image').forEach(el => {
        if (this._selectedNoteIds.has(el.dataset.noteId)) {
          el.classList.add('selected');
        }
      });
    }
  },

  /* 清除选中 */
  _clearSelection() {
    this._selectedNoteIds.clear();
    document.querySelectorAll('.note-card.selected, .plain-text-block.selected, .canvas-text-el.selected, .canvas-image.selected').forEach(el => el.classList.remove('selected'));
  },

  /* ==================== 连线系统 ==================== */

  startConnection(noteId, unitIndex) {
    if (this.isConnecting) {
      // 已在连线模式，完成连线
      this.completeConnection(noteId, unitIndex);
      return;
    }
    this.isConnecting = true;
    this.connectingFrom = noteId;
    this._connectingUnitIndex = unitIndex;
    document.getElementById('boardViewport')?.classList.add('connect-mode');

    // 高亮源便签
    const noteEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (noteEl) {
      noteEl.style.outline = '3px solid var(--accent)';
      noteEl.style.outlineOffset = '3px';
    }

    // 给其他便签添加可连线提示
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (canvas) {
      canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card').forEach(card => {
        if (card.dataset.noteId !== noteId) {
          card.classList.add('connecting-target');
        }
      });
    }

    // 显示颜色选择器
    this._showConnectionColorPicker(noteId, unitIndex);
  },

  startConnectionFromContext() {
    if (!this.contextNoteId) return;
    this.startConnection(this.contextNoteId, this.contextUnitIndex);
    this.hideContextMenu();
  },

  /* 显示连线颜色选择器 */
  _showConnectionColorPicker(noteId, unitIndex) {
    const picker = document.getElementById('connectionColorPicker');
    if (!picker) return;

    const noteEl = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (!noteEl) return;
    const rect = noteEl.getBoundingClientRect();

    let html = '';
    this.CONNECTION_COLORS.forEach(color => {
      html += `<div class="color-dot" style="background:${color};" onclick="BoardManager._selectConnectionColor('${color}')" title="${color}"></div>`;
    });
    picker.innerHTML = html;
    picker.style.left = (rect.right + 8) + 'px';
    picker.style.top = rect.top + 'px';
    picker.classList.add('visible');
    this._pendingConnectionColor = '#c0ab84';
    this._pickerOpenTime = Date.now();
  },

  _selectConnectionColor(color) {
    this._pendingConnectionColor = color;
    const picker = document.getElementById('connectionColorPicker');
    if (picker) picker.classList.remove('visible');
  },

  completeConnection(targetNoteId, unitIndex) {
    if (!this.isConnecting || !this.connectingFrom) return;
    if (this.connectingFrom === targetNoteId) {
      this._resetToWaitingSource(unitIndex);
      return;
    }
    if (unitIndex !== this._connectingUnitIndex) {
      // 不允许跨单元连线
      this._resetToWaitingSource(unitIndex);
      return;
    }

    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;

    // 检查是否已存在相同连线
    const exists = unit.connections.some(c =>
      (c.from === this.connectingFrom && c.to === targetNoteId) ||
      (c.from === targetNoteId && c.to === this.connectingFrom)
    );
    if (exists) {
      this._resetToWaitingSource(unitIndex);
      return;
    }

    this._pushUndo({ type: 'addConnection', from: this.connectingFrom, to: targetNoteId, unitIndex: unitIndex, connectionData: null });
    unit.connections.push({
      from: this.connectingFrom,
      to: targetNoteId,
      color: this._pendingConnectionColor || '#c0ab84'
    });

    // 更新撤回数据
    const lastUndo = this._undoStack[this._undoStack.length - 1];
    if (lastUndo) lastUndo.connectionData = { from: this.connectingFrom, to: targetNoteId, color: this._pendingConnectionColor || '#c0ab84' };

    // 连线完成后回到等待新起点状态，保持连线模式不退出
    this._resetToWaitingSource(unitIndex);

    this.renderConnections(unitIndex);
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('connectionsMade', { from: this.connectingFrom, to: targetNoteId });
    }
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 连线成功后回到等待选择起点状态（不退出连线模式） */
  _resetToWaitingSource(unitIndex) {
    // 清除源便签的高亮
    if (this.connectingFrom && this._connectingUnitIndex >= 0) {
      const noteEl = document.querySelector(`#unitCanvas_${this._connectingUnitIndex} [data-note-id="${this.connectingFrom}"]`);
      if (noteEl) {
        noteEl.style.outline = '';
        noteEl.style.outlineOffset = '';
      }
    }
    // 清除所有可连线提示
    document.querySelectorAll('.note-card.connecting-target, .plain-text-block.connecting-target, .canvas-text-el.connecting-target, .canvas-image.connecting-target, .battle-deploy-card.connecting-target').forEach(card => {
      card.classList.remove('connecting-target');
    });
    this.isConnecting = false;
    this.connectingFrom = null;
    this._connectingUnitIndex = -1;
    // 隐藏颜色选择器
    const picker = document.getElementById('connectionColorPicker');
    if (picker) picker.classList.remove('visible');
    // 回到等待选择起点状态
    this._waitingForConnectSource = true;
    DocEditor.showToast('请点击下一个便签作为连线起点', 'info');
  },

  /* 完全退出连线模式 */
  _exitConnectMode() {
    this._waitingForConnectSource = false;
    if (this.isConnecting) {
      if (this.connectingFrom && this._connectingUnitIndex >= 0) {
        const noteEl = document.querySelector(`#unitCanvas_${this._connectingUnitIndex} [data-note-id="${this.connectingFrom}"]`);
        if (noteEl) {
          noteEl.style.outline = '';
          noteEl.style.outlineOffset = '';
        }
      }
      document.querySelectorAll('.note-card.connecting-target, .plain-text-block.connecting-target, .canvas-text-el.connecting-target, .canvas-image.connecting-target, .battle-deploy-card.connecting-target').forEach(card => {
        card.classList.remove('connecting-target');
      });
      this.isConnecting = false;
      this.connectingFrom = null;
      this._connectingUnitIndex = -1;
      const picker = document.getElementById('connectionColorPicker');
      if (picker) picker.classList.remove('visible');
    }
    document.getElementById('toolConnectBtn')?.classList.remove('active');
    document.getElementById('boardViewport')?.classList.remove('connect-mode');
    const indicator = document.getElementById('boardModeIndicator');
    if (indicator) indicator.className = 'board-mode-indicator';
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('connectModeExited', {});
    }
  },

  /* 完全退出擦除模式 */
  _exitEraseMode() {
    this._isErasingConnections = false;
    document.getElementById('toolEraseBtn')?.classList.remove('active');
    document.getElementById('boardViewport')?.classList.remove('erase-mode');
    const indicator = document.getElementById('boardModeIndicator');
    if (indicator) indicator.className = 'board-mode-indicator';
    this._hideEraseTooltip();
  },

  _hideEraseTooltip() {
    const tooltip = document.getElementById('eraseTooltip');
    if (tooltip) tooltip.classList.remove('visible');
  },

  cancelConnection() {
    if (this.connectingFrom && this._connectingUnitIndex >= 0) {
      const noteEl = document.querySelector(`#unitCanvas_${this._connectingUnitIndex} [data-note-id="${this.connectingFrom}"]`);
      if (noteEl) {
        noteEl.style.outline = '';
        noteEl.style.outlineOffset = '';
      }
    }
    // 清除所有可连线提示
    document.querySelectorAll('.note-card.connecting-target, .plain-text-block.connecting-target, .canvas-text-el.connecting-target, .canvas-image.connecting-target, .battle-deploy-card.connecting-target').forEach(card => {
      card.classList.remove('connecting-target');
    });
    this.isConnecting = false;
    this.connectingFrom = null;
    this._connectingUnitIndex = -1;
    const picker = document.getElementById('connectionColorPicker');
    if (picker) picker.classList.remove('visible');
    document.getElementById('boardViewport')?.classList.remove('connect-mode');
    // 隐藏模式指示器
    const indicator = document.getElementById('boardModeIndicator');
    if (indicator) indicator.className = 'board-mode-indicator';
  },

  /* 删除连线 */
  deleteConnection(unitIndex, connIndex) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const conn = unit.connections[connIndex];
    if (conn) {
      this._pushUndo({ type: 'deleteConnection', from: conn.from, to: conn.to, unitIndex: unitIndex, connectionData: JSON.parse(JSON.stringify(conn)) });
    }
    unit.connections.splice(connIndex, 1);
    this.renderConnections(unitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 切换连线模式 */
  toggleConnectMode() {
    const viewport = document.getElementById('boardViewport');
    // 关闭擦除模式
    if (this._isErasingConnections) {
      this._exitEraseMode();
    }
    // 如果已在连线模式（等待选起点或正在连线中），退出
    if (this._waitingForConnectSource || this.isConnecting) {
      this._exitConnectMode();
      return;
    }
    // 进入连线模式：需要用户先选择一个便签
    DocEditor.showToast('请点击一个便签作为连线起点', 'info');
    document.getElementById('toolConnectBtn')?.classList.add('active');
    viewport?.classList.add('connect-mode');
    this._waitingForConnectSource = true;
    // 显示模式指示器（含退出按钮）
    const indicator = document.getElementById('boardModeIndicator');
    if (indicator) {
      indicator.innerHTML = '<div class="bmi-title-row"><span>连线模式</span><button class="bmi-exit-btn" onclick="BoardManager._exitConnectMode()" title="退出连线模式">&times;</button></div><span class="bmi-hint">点击两个元素连线 · 右键退出模式</span>';
      indicator.className = 'board-mode-indicator';
      void indicator.offsetWidth;
      indicator.className = 'board-mode-indicator visible connect';
    }
  },

  /* 切换擦除模式 */
  toggleEraseMode() {
    const viewport = document.getElementById('boardViewport');
    // 关闭连线模式（包括等待选择起点状态）
    if (this._waitingForConnectSource || this.isConnecting) {
      this._exitConnectMode();
    }

    this._isErasingConnections = !this._isErasingConnections;
    const btn = document.getElementById('toolEraseBtn');
    if (btn) btn.classList.toggle('active', this._isErasingConnections);
    viewport?.classList.toggle('erase-mode', this._isErasingConnections);
    if (this._isErasingConnections) {
      DocEditor.showToast('点击连线即可删除', 'info');
      // 显示模式指示器（含退出按钮）
      const indicator = document.getElementById('boardModeIndicator');
      if (indicator) {
        indicator.innerHTML = '<div class="bmi-title-row"><span>连线橡皮擦模式</span><button class="bmi-exit-btn" onclick="BoardManager._exitEraseMode()" title="退出擦除模式">&times;</button></div><span class="bmi-hint">点击连线删除 · 右键退出模式</span>';
        indicator.className = 'board-mode-indicator';
        void indicator.offsetWidth;
        indicator.className = 'board-mode-indicator visible erase';
      }
    } else {
      this._exitEraseMode();
    }
  },

  _onConnectionClick(unitIndex, connIndex) {
    if (this._isErasingConnections) {
      this.deleteConnection(unitIndex, connIndex);
    }
    // 普通模式下点击连线不做任何操作
  },

  /* ==================== 随机遭遇/盲盒范围操作 ==================== */

  toggleDiceRange(noteId, rangeIdx) {
    const found = this.findNote(noteId);
    if (!found) return;
    const note = found.note;
    if (!note.diceRanges || !note.diceRanges[rangeIdx]) return;
    note.diceRanges[rangeIdx]._expanded = !note.diceRanges[rangeIdx]._expanded;
    this.renderUnitNotes(found.unitIndex);
  },

  updateDiceRangeContent(noteId, rangeIdx, value) {
    const found = this.findNote(noteId);
    if (!found) return;
    if (!found.note.diceRanges || !found.note.diceRanges[rangeIdx]) return;
    found.note.diceRanges[rangeIdx].content = value;
    // 不频繁保存，等失焦或切换时保存
  },

  addDiceRange(noteId) {
    const found = this.findNote(noteId);
    if (!found) return;
    const dr = found.note.diceRanges;
    // 新格式：{dieType, headers, ranges}
    if (!Array.isArray(dr) && dr && dr.ranges) {
      const lastRange = dr.ranges[dr.ranges.length - 1];
      const newMin = lastRange ? lastRange.max + 1 : 1;
      const newMax = newMin + 4;
      dr.ranges.push({ min: newMin, max: newMax, content: '' });
    } else if (Array.isArray(dr)) {
      // 旧格式
      const lastRange = dr[dr.length - 1];
      const newMin = lastRange ? lastRange.max + 1 : 1;
      const newMax = newMin + 4;
      dr.push({ min: newMin, max: newMax, content: '' });
    } else {
      found.note.diceRanges = { dieType: 'd20', headers: [], ranges: [{ min: 1, max: 5, content: '' }] };
    }
    this.renderUnitNotes(found.unitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 画板编辑弹窗：添加盲盒范围行 */
  _addEditBxRangeRow() {
    const list = document.getElementById('editBxRangesList');
    if (!list) return;
    const div = document.createElement('div');
    div.className = 'bx-range-row';
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;align-items:center;';
    div.innerHTML = `
      <input type="text" class="bx-range-min" value="" placeholder="最小" style="width:50px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">
      <span style="color:var(--text-muted);">~</span>
      <input type="text" class="bx-range-max" value="" placeholder="最大" style="width:50px;text-align:center;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">
      <input type="text" class="bx-range-content" value="" placeholder="内容" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px;font-size:12px;box-sizing:border-box;">
      <button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>
    `;
    list.appendChild(div);
  },

  /* ==================== 右键菜单 ==================== */

  showNoteContextMenu(e, noteId, unitIndex) {
    this.contextNoteId = noteId;
    this.contextUnitIndex = unitIndex;

    // 隐藏纯文本右键菜单（如果存在）
    const ptMenu = document.getElementById('plainTextContextMenu');
    if (ptMenu) ptMenu.remove();

    const menu = document.getElementById('noteContextMenu');
    if (!menu) return;

    // 角色类型便签：编辑改为跳转角色图鉴
    const units = this.getFlowUnits();
    const note = units[unitIndex]?.notes?.find(n => n.id === noteId);
    const firstItem = menu.querySelector('.ctx-item:first-child');
    if (note && note.type === 'characters' && firstItem) {
      firstItem.innerHTML = '<span class="icon"><svg><use href="#i-cog"/></svg></span> 编辑角色(角色图鉴)';
    }

    // 填充子菜单（复制到/转移到其他单元）
    this._fillUnitSubmenus();

    // 更新"标记已使用"文本
    const found = this.findNote(noteId);
    const usedItem = menu.querySelector('.ctx-item:nth-child(2)');
    if (found && found.note.used) {
      usedItem.innerHTML = '<span class="icon"><svg><use href="#i-check"/></svg></span> 取消已使用';
    } else {
      usedItem.innerHTML = '<span class="icon"><svg><use href="#i-check"/></svg></span> 标记已使用';
    }

    // 显示/隐藏"跳转至原文"（仅当便签关联的条目有来源位置时显示）
    const jumpItem = document.getElementById('ctxJumpSource');
    if (jumpItem) {
      let hasSource = false;
      if (found && found.note.sourceEntryId) {
        const entry = this._findEntryById(found.note.sourceEntryId);
        hasSource = entry && entry.sourceLocation;
      }
      jumpItem.style.display = hasSource ? '' : 'none';
    }

    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible');

    // 确保菜单不超出视口
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = (e.clientX - rect.width) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = (e.clientY - rect.height) + 'px';
      }
      // 主菜单定位完成后，调整所有子菜单的展开方向
      this._adjustSubmenusPosition();
    });
  },

  /* 智能调整右键菜单子菜单的展开方向（避免出画） */
  _adjustSubmenusPosition() {
    const menu = document.getElementById('noteContextMenu');
    if (!menu) return;

    const submenus = menu.querySelectorAll('.ctx-submenu');
    submenus.forEach(sub => {
      // 重置之前的 inline 样式
      sub.style.left = '';
      sub.style.right = '';
      sub.style.top = '';
      sub.style.bottom = '';

      // 临时显示子菜单来测量尺寸（visibility:hidden 不影响布局但可测量）
      sub.style.visibility = 'hidden';
      sub.style.display = 'block';

      const subRect = sub.getBoundingClientRect();
      const parentItem = sub.parentElement;
      const parentRect = parentItem.getBoundingClientRect();

      sub.style.visibility = '';
      sub.style.display = '';

      // 判断水平方向：右侧空间不足且左侧空间足够 → 改到左侧展开
      const spaceRight = window.innerWidth - parentRect.right;
      const spaceLeft = parentRect.left;

      if (spaceRight < subRect.width + 8 && spaceLeft >= subRect.width + 8) {
        sub.style.left = 'auto';
        sub.style.right = '100%';
      } else {
        sub.style.left = '100%';
        sub.style.right = 'auto';
      }

      // 判断垂直方向：底部空间不足 → 让子菜单底部对齐父项底部（向上展开）
      const spaceBottom = window.innerHeight - parentRect.top;
      const subHeight = Math.min(subRect.height, 320); // 受 max-height 限制

      if (spaceBottom < subHeight + 8) {
        sub.style.top = 'auto';
        sub.style.bottom = '-4px';
      } else {
        sub.style.top = '-4px';
        sub.style.bottom = 'auto';
      }
    });
  },

  hideContextMenu() {
    const menu = document.getElementById('noteContextMenu');
    if (menu) menu.classList.remove('visible');
    const ptMenu = document.getElementById('plainTextContextMenu');
    if (ptMenu) ptMenu.remove();
    const txtMenu = document.getElementById('textElementContextMenu');
    if (txtMenu) txtMenu.remove();
    const imgMenu = document.getElementById('imageContextMenu');
    if (imgMenu) imgMenu.remove();
    this._hideBgFrameCtxMenu();
    this.contextNoteId = null;
    this.contextUnitIndex = -1;
  },

  /* ========== 原文溯源跳转系统 ========== */

  /* 在所有数据库中按 entryId 查找条目 */
  _findEntryById(entryId) {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return null;
    for (const groupKey of Object.keys(mod.databases)) {
      const group = mod.databases[groupKey];
      for (const dbKey of Object.keys(group)) {
        const db = group[dbKey];
        if (Array.isArray(db)) {
          const entry = db.find(e => e.id === entryId);
          if (entry) return entry;
        }
      }
    }
    return null;
  },

  /* 从带团板便签跳转到文档编辑器中的原文位置 */
  jumpToSource() {
    const noteId = this.contextNoteId;
    this.hideContextMenu();
    if (!noteId) return;
    const found = this.findNote(noteId);
    if (!found || !found.note.sourceEntryId) return;

    const entry = this._findEntryById(found.note.sourceEntryId);
    if (!entry || !entry.sourceLocation) return;

    // 分屏模式：通过消息通知文档编辑器定位
    try {
      if (typeof SharedBridge !== 'undefined' && SharedBridge.isInIframe()) {
        SharedBridge.send('JUMP_TO_SOURCE', {
          entryId: found.note.sourceEntryId,
          sourceLocation: entry.sourceLocation,
          snippet: entry.sourceLocation?.textSnippet || ''
        });
        return;
      }
    } catch(e) { /* ignore if SharedBridge unavailable */ }

    // 如果当前在编辑器中，先保存当前内容（防止丢失未保存的编辑）
    if (AppState.currentPage === 'editor') {
      DocEditor.saveDocument();
    }

    // 切换到文档编辑器
    UIRender.switchPage('editor');
    DocEditor.loadDocument(AppState.currentModule);

    // 等待 DOM 更新后定位
    requestAnimationFrame(() => {
      const marker = DocEditor.editorEl.querySelector(`.source-marker[data-source-entry-id="${entry.id}"]`);
      if (marker) {
        marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮闪现动画
        marker.classList.remove('source-flash');
        void marker.offsetWidth; // 强制重排以重启动画
        marker.classList.add('source-flash');
        // 动画结束后移除 class
        setTimeout(() => marker.classList.remove('source-flash'), 2000);
        // 显示面包屑提示
        this._showSourceBreadcrumb(entry.sourceLocation, entry);
      } else {
        // 标记不存在（可能被用户编辑删除），尝试用文本搜索
        const snippet = entry.sourceLocation.textSnippet;
        if (snippet) {
          const walker = document.createTreeWalker(DocEditor.editorEl, NodeFilter.SHOW_TEXT, null, false);
          let node;
          while (node = walker.nextNode()) {
            const idx = node.textContent.indexOf(snippet.substring(0, 30));
            if (idx !== -1) {
              // 找到文本，创建临时高亮
              const range = document.createRange();
              range.setStart(node, idx);
              range.setEnd(node, Math.min(idx + snippet.substring(0, 30).length, node.textContent.length));
              const tempSpan = document.createElement('span');
              tempSpan.style.cssText = 'background:rgba(255,193,7,0.5);border-radius:3px;';
              range.surroundContents(tempSpan);
              tempSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
              tempSpan.classList.add('source-flash');
              setTimeout(() => {
                const parent = tempSpan.parentNode;
                if (parent) parent.replaceChild(document.createTextNode(tempSpan.textContent), tempSpan);
                parent.normalize();
              }, 2000);
              this._showSourceBreadcrumb(entry.sourceLocation, entry);
              return;
            }
          }
        }
        DocEditor.showToast('原文位置未找到，可能已被编辑修改', 'warning');
      }
    });
  },

  /* 显示来源面包屑提示 */
  _showSourceBreadcrumb(sourceLocation, entry) {
    // 移除已有的面包屑
    const existing = document.querySelector('.source-breadcrumb');
    if (existing) existing.remove();

    const bc = document.createElement('div');
    bc.className = 'source-breadcrumb';

    const pathStr = sourceLocation.headingPath.map(h => h.text).join(' › ') || '文档顶部';
    const snippet = sourceLocation.textSnippet || (entry.content || '').substring(0, 80);

    bc.innerHTML = `
      <span class="bc-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>
      <span class="bc-path">${pathStr}</span>
      <span class="bc-snippet">「${snippet.substring(0, 40)}${snippet.length > 40 ? '…' : ''}」</span>
    `;

    document.body.appendChild(bc);
    requestAnimationFrame(() => bc.classList.add('visible'));
    setTimeout(() => {
      bc.classList.remove('visible');
      setTimeout(() => bc.remove(), 300);
    }, 3000);
  },

  _fillUnitSubmenus() {
    const units = this.getFlowUnits();
    const copySub = document.getElementById('ctxCopyToSubmenu');
    const moveSub = document.getElementById('ctxMoveToSubmenu');
    const typeSub = document.getElementById('ctxChangeTypeSubmenu');

    let copyHtml = '';
    let moveHtml = '';

    // 复制子菜单：包含"当前单元"选项
    const currentUnit = units[this.contextUnitIndex];
    if (currentUnit) {
      copyHtml += `<div class="ctx-item" onclick="event.stopPropagation(); BoardManager.copyNoteToUnit(${this.contextUnitIndex})" style="font-weight:600;color:var(--accent);">${this.contextUnitIndex + 1}. ${this._esc(currentUnit.title || '未命名')} (当前)</div>`;
    }
    units.forEach((unit, idx) => {
      if (idx === this.contextUnitIndex) return;
      const label = `${idx + 1}. ${this._esc(unit.title || '未命名')}`;
      copyHtml += `<div class="ctx-item" onclick="event.stopPropagation(); BoardManager.copyNoteToUnit(${idx})">${label}</div>`;
      moveHtml += `<div class="ctx-item" onclick="event.stopPropagation(); BoardManager.moveNoteToUnit(${idx})">${label}</div>`;
    });

    if (units.length <= 1) {
      copyHtml = '<div style="padding:8px 14px;font-size:12px;color:var(--text-muted);">只有一个单元</div>';
      moveHtml = copyHtml;
    }
    if (copySub) copySub.innerHTML = copyHtml;
    if (moveSub) moveSub.innerHTML = moveHtml;

    // 更改类型子菜单
    if (typeSub) {
      const typeList = Object.entries(DatabaseManager.getMergedDbConfig());
      let typeHtml = '';
      typeList.forEach(([key, cfg]) => {
        typeHtml += `<div class="ctx-item" onclick="event.stopPropagation(); BoardManager.changeNoteType('${this.contextNoteId}', ${this.contextUnitIndex}, '${key}')">`;
        typeHtml += `<span class="icon"><svg><use href="#${cfg.icon}"/></svg></span> ${this._esc(cfg.name)}`;
        typeHtml += `</div>`;
      });
      typeSub.innerHTML = typeHtml;
    }
  },

  editContextNote() {
    if (this.contextNoteId) {
      const units = this.getFlowUnits();
      const note = units[this.contextUnitIndex]?.notes?.find(n => n.id === this.contextNoteId);
      if (note && note.type === 'characters') {
        UIRender.switchPage('characters');
        CharAlbum.selectCharacter(this.contextNoteId);
      } else if (note && (note.type === 'plaintext' || note.type === 'text' || note.type === 'encounters' || note.type === 'blindbox')) {
        this.editNote(this.contextNoteId, this.contextUnitIndex);
      } else {
        this.editNoteContent(this.contextNoteId, this.contextUnitIndex);
      }
    }
    this.hideContextMenu();
  },

  toggleContextNoteUsed() {
    if (this.contextNoteId) {
      this.toggleNoteUsed(this.contextNoteId, this.contextUnitIndex);
    }
    this.hideContextMenu();
  },

  deleteContextNote() {
    if (this.contextNoteId) {
      this.deleteNote(this.contextNoteId, this.contextUnitIndex);
    }
    this.hideContextMenu();
  },

  /* 置于顶层 */
  bringNoteToFront() {
    this._adjustLayer(this.contextNoteId, this.contextUnitIndex, 'front');
    this.hideContextMenu();
  },

  /* 置于底层 */
  sendNoteToBack() {
    this._adjustLayer(this.contextNoteId, this.contextUnitIndex, 'back');
    this.hideContextMenu();
  },

  /* 通用层级调整 */
  _adjustLayer(noteId, unitIndex, direction) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    // 收集当前单元所有元素的 zIndex
    const zValues = unit.notes.map(n => n.zIndex || 0);
    if (direction === 'front') {
      const maxZ = Math.max(...zValues, 0);
      note.zIndex = maxZ + 1;
    } else {
      const minZ = Math.min(...zValues, Infinity);
      note.zIndex = Math.max(2, minZ === Infinity ? 2 : minZ - 1);
    }

    // 更新 DOM
    const el = document.querySelector(`#unitCanvas_${unitIndex} [data-note-id="${noteId}"]`);
    if (el) el.style.zIndex = note.zIndex;

    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 复制便签到指定单元（包括当前单元） */
  copyNoteToUnit(targetIndex) {
    const found = this.findNote(this.contextNoteId);
    if (!found) return;
    const srcNote = found.note;
    const destUnit = this.getFlowUnits()[targetIndex];
    if (!destUnit) return;

    const isCurrentUnit = targetIndex === this.contextUnitIndex;
    const destVp = destUnit.viewport || { x: 0, y: 0, scale: 1 };
    const newNote = {
      ...srcNote,
      id: AppState.generateUUID(),
      // 如果复制到当前单元，偏移位置避免重叠；否则放到目标单元视口中心
      x: isCurrentUnit ? srcNote.x + 30 : destVp.x + 100,
      y: isCurrentUnit ? srcNote.y + 30 : destVp.y + 100,
      diceRanges: srcNote.diceRanges ? srcNote.diceRanges.map(r => ({ ...r })) : null,
      characterData: srcNote.characterData ? { ...srcNote.characterData, fields: { ...srcNote.characterData.fields } } : null
    };
    destUnit.notes.push(newNote);
    this.hideContextMenu();
    this.renderUnitNotes(targetIndex);
    this.renderBackgroundFrames(targetIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 复制元素到当前单元附近（偏移30px）——支持纯文本框/纯文字/图片 */
  duplicateElement() {
    const found = this.findNote(this.contextNoteId);
    if (!found) return;
    const src = found.note;
    const unit = this.getCurrentUnit();
    if (!unit) return;

    const newNote = { ...src, id: AppState.generateUUID(), x: src.x + 30, y: src.y + 30 };
    if (src.type === 'plaintext' && src.style) {
      newNote.style = { ...src.style };
    }
    unit.notes.push(newNote);
    this.renderUnitNotes(this.contextUnitIndex);
    this.renderBackgroundFrames(this.contextUnitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 复制便签文本内容到系统剪贴板 */
  copyNoteText(noteId, unitIndex) {
    const idx = (unitIndex !== undefined) ? unitIndex : this.currentUnitIndex;
    const units = this.getFlowUnits();
    const unit = units[idx];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    let text = '';
    if (note.type === 'plaintext' || note.type === 'text') {
      text = note.content || '';
    } else {
      // 便签卡片：提取标题 + 正文（HTML → 纯文本）
      const title = note.title || '';
      const body = note.content || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = body;
      const bodyText = tmp.textContent || '';
      text = title ? title + '\n' + bodyText : bodyText;
    }

    if (!text.trim()) return;

    navigator.clipboard.writeText(text).then(() => {
      // 在鼠标位置显示 Toast
      this._showCopyToast();
    }).catch(() => {
      // 降级方案：使用 textarea + execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this._showCopyToast();
    });
  },

  /* 显示"已复制"Toast 反馈 */
  _showCopyToast() {
    const old = document.querySelector('.board-copy-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'board-copy-toast';
    toast.textContent = '✓ 已复制';
    toast.style.left = '50%';
    toast.style.top = '60px';
    toast.style.transform = 'translate(-50%, 0)';
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.add('fadeout');
        setTimeout(() => toast.remove(), 300);
      }, 1200);
    });
  },

  /* 转移便签到其他单元 */
  moveNoteToUnit(targetIndex) {
    const found = this.findNote(this.contextNoteId);
    if (!found) return;
    const srcUnit = this.getFlowUnits()[found.unitIndex];
    const destUnit = this.getFlowUnits()[targetIndex];
    if (!srcUnit || !destUnit) return;

    const noteIdx = srcUnit.notes.findIndex(n => n.id === this.contextNoteId);
    if (noteIdx === -1) return;
    const [movedNote] = srcUnit.notes.splice(noteIdx, 1);
    // 移除关联连线
    srcUnit.connections = srcUnit.connections.filter(c => c.from !== movedNote.id && c.to !== movedNote.id);

    const targetVp = destUnit.viewport || { x: 0, y: 0, scale: 1 };
    movedNote.x = targetVp.x + 100;
    movedNote.y = targetVp.y + 100;
    destUnit.notes.push(movedNote);

    this.hideContextMenu();
    this.renderUnitNotes(found.unitIndex);
    this.renderBackgroundFrames(found.unitIndex);
    this.renderConnections(found.unitIndex);
    this.renderUnitNotes(targetIndex);
    this.renderBackgroundFrames(targetIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 更改便签类型 */
  changeNoteType(noteId, unitIndex, newType) {
    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    // 从常规类型改为特殊类型，初始化对应数据
    if ((newType === 'encounters' || newType === 'blindbox') && note.type !== 'encounters' && note.type !== 'blindbox') {
      if (!note.diceRanges) {
        note.diceRanges = [{ min: 1, max: 5, content: '' }];
      }
    }
    // 从特殊类型改为常规，清除特殊数据
    if ((note.type === 'encounters' || note.type === 'blindbox') && newType !== 'encounters' && newType !== 'blindbox') {
      note.diceRanges = null;
    }
    // 角色类型特殊处理
    if (newType === 'characters' && note.type !== 'characters') {
      if (!note.characterData) {
        if (SystemManager.getCurrentSystem() === 'coc7') {
          note.characterData = _createCocCharacterData();
        } else {
          note.characterData = { name: note.title || '新角色', fields: {} };
        }
      }
      if (!note.combatTracker) {
        note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
      }
    }
    if (note.type === 'characters' && newType !== 'characters') {
      note.characterData = null;
      note.combatTracker = null;
    }

    note.type = newType;
    this.hideContextMenu();
    this.renderUnitNotes(unitIndex);
    this.saveBoard();
    StorageManager.scheduleSave();
  },

  /* 添加角色特质行 */
  _addCharTraitRow() {
    const container = document.getElementById('charTraitsList');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'char-trait-row';
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `<input type="text" class="trait-title" placeholder="标题" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"><input type="text" class="trait-desc" placeholder="描述" style="flex:2;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"><button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
    container.appendChild(div);
  },

  /* 添加角色动作行 */
  _addCharActionRow() {
    const container = document.getElementById('charActionsList');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'char-action-row';
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
    div.innerHTML = `<input type="text" class="action-title" placeholder="标题" style="flex:1;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"><input type="text" class="action-desc" placeholder="描述" style="flex:2;border:1px solid var(--border);border-radius:4px;padding:4px 6px;font-size:12px;box-sizing:border-box;"><button onclick="this.parentElement.remove()" style="border:none;background:none;color:var(--text-muted);cursor:pointer;padding:4px;">✕</button>`;
    container.appendChild(div);
  },

  /* ==================== 缩略图概览 ==================== */

  showThumbnailOverview() {
    const overlay = document.getElementById('boardOverview');
    const content = document.getElementById('boardOverviewContent');
    if (!overlay || !content) return;

    const units = this.getFlowUnits();
    let html = '<h3>流程单元概览</h3><div class="overview-grid">';
    units.forEach((unit, idx) => {
      const active = idx === this.currentUnitIndex ? ' active' : '';
      html += `<div class="overview-unit${active}" onclick="BoardManager.goToUnit(${idx}); BoardManager.hideOverview();">`;
      html += `<h4>${idx + 1}. ${this._esc(unit.title || '未命名')}</h4>`;
      html += `<div class="overview-count">${unit.notes.length} 个便签</div>`;
      if (unit.description) {
        html += `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${this._esc(unit.description.substring(0, 60))}</div>`;
      }
      html += `</div>`;
    });
    html += '</div>';
    content.innerHTML = html;
    overlay.classList.remove('hidden');

    // 点击遮罩关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) this.hideOverview();
    };
  },

  hideOverview() {
    const overlay = document.getElementById('boardOverview');
    if (overlay) overlay.classList.add('hidden');
  },

  /* ==================== 数据库面板 ==================== */

  toggleDbPanel() {
    this._dbPanelOpen = !this._dbPanelOpen;
    const panel = document.getElementById('boardDbPanel');
    const viewport = document.getElementById('boardViewport');
    if (panel) panel.classList.toggle('open', this._dbPanelOpen);
    if (viewport) viewport.classList.toggle('has-db-panel', this._dbPanelOpen);

    if (this._dbPanelOpen) {
      const mod = AppState.currentModule;
      if (mod && mod.databases) {
        const groups = Object.keys(mod.databases);
        const group = groups[0] || '1号库';
        if (!this._currentDbGroup || !mod.databases[this._currentDbGroup]) {
          this.selectDbGroup(group);
        } else {
          this.renderDbGroupSelector();
          this.renderDbList();
          if (!this._currentDbKey) {
            const firstWithData = Object.keys(DatabaseManager.getMergedDbConfig()).find(k => mod.databases[this._currentDbGroup] && mod.databases[this._currentDbGroup][k] && mod.databases[this._currentDbGroup][k].length > 0);
            this.selectDb(firstWithData || 'characters');
          } else {
            this.renderDbEntries(this._currentDbKey);
          }
        }
      }
      
      if (typeof Tutorial !== 'undefined') {
        Tutorial.emit('dbPanelOpened', {});
      }
    }
  },

  _getGroupDb() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases || !this._currentDbGroup) return null;
    return mod.databases[this._currentDbGroup];
  },

  renderDbGroupSelector() {
    const selector = document.getElementById('boardDbGroupSelector');
    if (!selector) return;

    const mod = AppState.currentModule;
    if (!mod || !mod.databases) {
      selector.innerHTML = '';
      return;
    }

    const groups = Object.keys(mod.databases);
    const currentGroup = this._currentDbGroup || groups[0] || '1号库';

    let html = `
      <select id="boardDbGroupSelect" onchange="BoardManager.selectDbGroup(this.value)" class="db-group-select">
    `;
    for (const group of groups) {
      const selected = group === currentGroup ? 'selected' : '';
      html += `<option value="${this._esc(group)}" ${selected}>${this._esc(group)}</option>`;
    }
    html += `</select>`;
    html += `<button onclick="BoardManager.addDbGroup()" class="db-group-add" title="添加库"><span class="icon"><svg><use href="#i-plus"/></svg></span></button>`;
    html += `<button onclick="BoardManager.confirmDeleteDbGroup()" class="db-group-delete" title="删除当前库" ${groups.length <= 1 ? 'disabled' : ''}><span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span></button>`;

    selector.innerHTML = html;
  },

  selectDbGroup(group) {
    if (!group) return;

    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;

    if (!mod.databases[group]) {
      mod.databases[group] = {};
      for (const key of Object.keys(DatabaseManager.getMergedDbConfig())) {
        mod.databases[group][key] = [];
      }
    }

    this._currentDbGroup = group;
    this._currentDbKey = null;

    this.renderDbGroupSelector();
    this.renderDbList();

    const firstWithData = Object.keys(DatabaseManager.getMergedDbConfig()).find(k => mod.databases[group][k] && mod.databases[group][k].length > 0);
    this.selectDb(firstWithData || 'characters');
  },

  addDbGroup() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;

    let newIndex = 1;
    while (mod.databases[`${newIndex}号库`]) {
      newIndex++;
    }

    const newGroup = `${newIndex}号库`;
    mod.databases[newGroup] = {};
    for (const key of Object.keys(DatabaseManager.getMergedDbConfig())) {
      mod.databases[newGroup][key] = [];
    }

    StorageManager.scheduleSave();
    this.selectDbGroup(newGroup);
  },

  /* 确认删除库分组 */
  confirmDeleteDbGroup() {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;
    const groups = Object.keys(mod.databases);
    if (groups.length <= 1) return;
    const groupName = this._currentDbGroup || groups[0];

    let totalCount = 0;
    const groupDb = mod.databases[groupName];
    if (groupDb) {
      for (const key of Object.keys(groupDb)) {
        totalCount += (groupDb[key] || []).length;
      }
    }

    const message = totalCount > 0
      ? `确定要删除「${groupName}」吗？该库下共有 ${totalCount} 条数据，将一起被删除。此操作不可撤销。`
      : `确定要删除「${groupName}」吗？此操作不可撤销。`;

    App.showConfirm(
      '确认删除',
      message,
      '删除',
      () => { this.deleteDbGroup(groupName); }
    );
  },

  /* 删除库分组 */
  deleteDbGroup(groupName) {
    const mod = AppState.currentModule;
    if (!mod || !mod.databases) return;
    const groups = Object.keys(mod.databases);
    if (groups.length <= 1) return;

    delete mod.databases[groupName];

    if (this._currentDbGroup === groupName) {
      const remaining = Object.keys(mod.databases);
      this._currentDbGroup = remaining[0];
    }

    StorageManager.scheduleSave();
    this.selectDbGroup(this._currentDbGroup);
    DatabaseManager.renderDbGroupSelector();
    DatabaseManager.renderDbList();
  },

  toggleDbPanelWide() {
    this._dbPanelWide = !this._dbPanelWide;
    const panel = document.getElementById('boardDbPanel');
    const viewport = document.getElementById('boardViewport');
    if (panel) panel.classList.toggle('wide', this._dbPanelWide);
    if (viewport) viewport.classList.toggle('wide', this._dbPanelWide);
  },

  renderDbList() {
    const sidebar = document.getElementById('boardDbSidebar');
    if (!sidebar) return;

    const groupDb = this._getGroupDb();
    const mergedConfig = DatabaseManager.getMergedDbConfig();
    let html = '';
    for (const [key, cfg] of Object.entries(mergedConfig)) {
      const active = key === this._currentDbKey ? ' active' : '';
      const entries = groupDb && groupDb[key] ? groupDb[key] : [];
      const totalCount = entries.length;
      const placedCount = entries.filter(e => AppState.placedEntryIds.has(e.id)).length;
      const isProtected = key === 'characters';
      const deleteBtn = isProtected
        ? `<span class="db-tab-delete db-tab-delete-disabled">×</span>`
        : `<span class="db-tab-delete" onclick="event.stopPropagation(); DatabaseManager.confirmDeleteCustomType('${key}')">×</span>`;
      html += `<div class="db-tab-sticky${active}" data-db-key="${key}" onclick="BoardManager.selectDb('${key}')">`;
      html += `<span class="icon"><svg><use href="#${cfg.icon}"/></svg></span>`;
      html += `<span class="tab-name">${this._esc(cfg.name)}</span>`;
      html += `<span class="tab-count">${placedCount}/${totalCount}</span>`;
      html += deleteBtn;
      html += `</div>`;
    }
    html += `<div class="db-tab-add" onclick="DatabaseManager.showAddTypeDialog()">`;
    html += `<span class="icon"><svg><use href="#i-plus"/></svg></span>`;
    html += `<span>添加类型</span>`;
    html += `</div>`;
    sidebar.innerHTML = html;
  },

  selectDb(dbKey) {
    this._currentDbKey = dbKey;

    // 切换类型时取消多选模式
    this._multiSelectMode = false;
    this._selectedEntryIds.clear();
    this._updateMultiSelectBtn();

    const sidebar = document.getElementById('boardDbSidebar');
    if (sidebar) {
      sidebar.querySelectorAll('.db-tab-sticky').forEach(el => {
        el.classList.toggle('active', el.dataset.dbKey === dbKey);
      });
    }
    this.renderDbEntries(dbKey);
  },

  renderDbEntries(dbKey) {
    const container = document.getElementById('boardDbContent');
    if (!container) return;

    const groupDb = this._getGroupDb();
    const entries = groupDb && groupDb[dbKey] ? groupDb[dbKey] : [];
    const cfg = DatabaseManager.getMergedDbConfig()[dbKey];

    const multiMode = this._multiSelectMode;
    const selectedCount = this._selectedEntryIds.size;
    const allSelected = entries.length > 0 && entries.every(e => this._selectedEntryIds.has(e.id));

    let html = '';

    // 多选模式操作栏
    if (multiMode) {
      html += `
        <div class="db-multi-select-bar">
          <button class="multi-select-btn" onclick="BoardManager.toggleAllEntries()">
            ${allSelected ? '取消全选' : '全选'}
          </button>
          <span class="multi-select-count">已选 ${selectedCount} 条</span>
          <button class="multi-delete-btn" onclick="BoardManager.deleteSelectedEntries('${dbKey}')" ${selectedCount === 0 ? 'disabled' : ''}>
            删除选中 (${selectedCount})
          </button>
        </div>
      `;
    }

    html += `<div class="db-entries-header">${this._esc(cfg ? cfg.name : dbKey)} (${entries.length})</div>`;
    html += `<div class="db-entries-grid">`;

    if (entries.length === 0) {
      html += '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">暂无条目</div>';
    } else {
      entries.forEach(entry => {
        const isPlaced = AppState.placedEntryIds.has(entry.id);
        const placedClass = isPlaced ? 'placed' : '';
        const isSelected = this._selectedEntryIds.has(entry.id);
        const selectedClass = isSelected ? 'multi-selected' : '';
        const title = entry.name || (entry.content || '').substring(0, 30) || '未命名';
        const summary = (entry.content || '').substring(0, 60).replace(/\n/g, ' ');

        // 多选复选框
        const checkboxHtml = multiMode ? `<div class="db-entry-checkbox ${isSelected ? 'checked' : ''}">${isSelected ? '<svg><use href="#i-check"/></svg>' : ''}</div>` : '';

        // 多选模式下点击卡片切换选中，非多选模式保持原有行为
        const cardClick = multiMode
          ? `onclick="BoardManager.toggleEntrySelect('${entry.id}')"`
          : `onclick="BoardManager.placeFromDatabase('${dbKey}', '${entry.id}')" oncontextmenu="event.preventDefault(); BoardManager.editDbEntry('${entry.id}', '${dbKey}')"`;

        html += `<div class="db-entry-card ${placedClass} ${selectedClass}" data-entry-id="${entry.id}" ${cardClick}>`;
        html += checkboxHtml;
        html += `<div class="entry-title">${this._esc(title)}</div>`;
        if (summary) {
          html += `<div class="entry-summary">${this._esc(summary)}</div>`;
        }
        if (isPlaced) {
          html += `<div class="entry-placed">已放置</div>`;
        }
        if (!multiMode) {
          html += `<div class="db-entry-actions">`;
          html += `<button title="编辑" onclick="event.stopPropagation(); BoardManager.editDbEntry('${entry.id}', '${dbKey}')"><span class="icon"><svg><use href="#i-cog"/></svg></span></button>`;
          html += `<button title="删除" onclick="event.stopPropagation(); BoardManager.deleteDbEntry('${entry.id}', '${dbKey}')"><span class="icon"><svg><use href="#i-trash"/></svg></span></button>`;
          html += `</div>`;
        }
        html += `</div>`;
      });
    }

    html += `</div>`;
    container.innerHTML = html;
  },

  editDbEntry(entryId, dbKey) {
    DatabaseManager._currentDbGroup = this._currentDbGroup;
    DatabaseManager.openEntryEditor(entryId, dbKey);
  },

  deleteDbEntry(entryId, dbKey) {
    DatabaseManager._currentDbGroup = this._currentDbGroup;
    DatabaseManager.deleteEntry(entryId, dbKey);
  },

  /* ===== 多选删除功能 ===== */

  /* 切换多选模式 */
  toggleMultiSelect() {
    this._multiSelectMode = !this._multiSelectMode;
    if (!this._multiSelectMode) {
      this._selectedEntryIds.clear();
    }
    this._updateMultiSelectBtn();
    if (this._currentDbKey) {
      this.renderDbEntries(this._currentDbKey);
    }
  },

  /* 更新顶部栏多选按钮状态 */
  _updateMultiSelectBtn() {
    const btn = document.getElementById('boardDbMultiSelectBtn');
    if (!btn) return;
    if (this._multiSelectMode) {
      btn.classList.add('active');
      btn.querySelector('.btn-label').textContent = '退出多选';
    } else {
      btn.classList.remove('active');
      btn.querySelector('.btn-label').textContent = '多选';
    }
  },

  /* 切换单个条目的选中状态 */
  toggleEntrySelect(entryId) {
    if (!this._multiSelectMode) return;
    if (this._selectedEntryIds.has(entryId)) {
      this._selectedEntryIds.delete(entryId);
    } else {
      this._selectedEntryIds.add(entryId);
    }
    if (this._currentDbKey) {
      this.renderDbEntries(this._currentDbKey);
    }
  },

  /* 全选 / 取消全选 */
  toggleAllEntries() {
    if (!this._multiSelectMode || !this._currentDbKey) return;
    const groupDb = this._getGroupDb();
    if (!groupDb || !groupDb[this._currentDbKey]) return;

    const entries = groupDb[this._currentDbKey];
    const allSelected = entries.length > 0 && entries.every(e => this._selectedEntryIds.has(e.id));

    if (allSelected) {
      this._selectedEntryIds.clear();
    } else {
      entries.forEach(e => this._selectedEntryIds.add(e.id));
    }
    this.renderDbEntries(this._currentDbKey);
  },

  /* 批量删除选中条目 */
  deleteSelectedEntries(dbKey) {
    if (!this._multiSelectMode) return;
    const count = this._selectedEntryIds.size;
    if (count === 0) return;

    App.showConfirm(
      '确认删除',
      `确定要删除选中的 ${count} 条条目吗？此操作不可撤销。`,
      '删除',
      () => {
        const groupDb = this._getGroupDb();
        if (!groupDb || !groupDb[dbKey]) return;

        for (let i = groupDb[dbKey].length - 1; i >= 0; i--) {
          if (this._selectedEntryIds.has(groupDb[dbKey][i].id)) {
            AppState.placedEntryIds.delete(groupDb[dbKey][i].id);
            groupDb[dbKey].splice(i, 1);
          }
        }

        this._selectedEntryIds.clear();
        StorageManager.scheduleSave();

        this.renderDbList();
        this.renderDbEntries(dbKey);

        if (DatabaseManager._currentDbKey === dbKey && DatabaseManager._currentDbGroup === this._currentDbGroup) {
          DatabaseManager.renderDbList();
          DatabaseManager.renderEntries(dbKey);
        }

        DocEditor.showToast(`已删除 ${count} 条条目`, 'success');
      }
    );
  },

  /* ==================== 保存/加载 ==================== */

  saveBoard() {
    const board = this.getBoard();
    if (!board) return;
    // 保存当前单元的视口状态
    const currentUnit = this.getCurrentUnit();
    if (currentUnit) {
      currentUnit.viewport = { x: this.viewport.x, y: this.viewport.y, scale: this.scale };
    }
    // board 数据已在 AppState.currentModule.board 中，自动保存会处理
  },

  loadBoard() {
    const board = this.getBoard();
    if (!board) return;
    // 确保每个单元有 viewport 和 backgroundFrames（向后兼容）
    for (const unit of board.flowUnits) {
      if (!unit.viewport) {
        unit.viewport = { x: 0, y: 0, scale: 1 };
      }
      if (!unit.backgroundFrames) {
        unit.backgroundFrames = [];
      }
    }
    // 加载当前单元的视口
    const currentUnit = this.getCurrentUnit();
    if (currentUnit && currentUnit.viewport) {
      this.viewport = { x: currentUnit.viewport.x, y: currentUnit.viewport.y };
      this.scale = currentUnit.viewport.scale || 1;
    }
    if (board && !board.flowUnits) {
      board.flowUnits = [];
    }
    if (board && !board.unitType) {
      board.unitType = 'scene';
    }
    if (board && !board.worldTime) {
      board.worldTime = { time: 480, day: 1, logs: [], expanded: false };
    }
    if (board && !board.battleDeployments) {
      board.battleDeployments = [];
    }
  },

  /* ==================== 搜索 ==================== */

  _boardSearchDebounceTimer: null,

  /* 切换搜索栏显示/隐藏 */
  toggleSearch() {
    const bar = document.getElementById('boardSearchBar');
    if (!bar) return;
    bar.classList.toggle('visible');
    if (bar.classList.contains('visible')) {
      const input = document.getElementById('boardSearchInput');
      if (input) input.focus();
    } else {
      this._clearBoardSearchFilter();
      const results = document.getElementById('boardSearchResults');
      if (results) results.classList.remove('visible');
      const count = document.getElementById('boardSearchCount');
      if (count) count.textContent = '';
    }
    // 更新世界时钟和左侧工具栏位置
    requestAnimationFrame(() => {
      if (typeof WorldClock !== 'undefined') WorldClock._updatePosition();
      this._updateToolsPosition();
    });
  },

  /* 初始化工具按钮瞄准镜角标元素 */
  _initToolCorners() {
    if (this._toolCornersInited) return;
    this._toolCornersInited = true;
    const corners = ['tl', 'tr', 'br', 'bl'];
    document.querySelectorAll('.board-connection-tools .tool-btn').forEach(btn => {
      corners.forEach(c => {
        const el = document.createElement('div');
        el.className = 'tool-btn-corner ' + c;
        btn.appendChild(el);
      });
    });
  },

  /* 更新左侧工具栏和模式指示器的位置，使其跟随标题栏位移 */
  _updateToolsPosition() {
    this._initToolCorners();
    const page = document.querySelector('.board-page');
    if (!page) return;
    let top = 0;
    const stopClasses = ['board-viewport', 'board-thumbnails'];
    const children = page.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (stopClasses.some(c => child.classList.contains(c))) break;
      if (child.classList.contains('board-connection-tools')) continue;
      if (child.classList.contains('board-mode-indicator')) continue;
      if (child.classList.contains('world-clock')) continue;
      top += child.offsetHeight;
      if (child.classList.contains('board-unit-header')) break;
    }
    const toolsTop = top + 10;
    const tools = document.getElementById('boardConnectionTools');
    if (tools) tools.style.top = toolsTop + 'px';
    const indicator = document.getElementById('boardModeIndicator');
    if (indicator) indicator.style.top = toolsTop + 'px';
  },

  /* 执行带团板搜索 */
  performBoardSearch() {
    const input = document.getElementById('boardSearchInput');
    if (!input) return;
    const query = input.value.trim().toLowerCase();
    const countEl = document.getElementById('boardSearchCount');
    const resultsEl = document.getElementById('boardSearchResults');

    if (!query) {
      this._clearBoardSearchFilter();
      if (resultsEl) resultsEl.classList.remove('visible');
      if (countEl) countEl.textContent = '';
      return;
    }

    const units = this.getFlowUnits();
    const results = [];

    units.forEach((unit, unitIndex) => {
      if (!unit.notes) return;
      unit.notes.forEach(note => {
        const title = (note.title || '').toLowerCase();
        const content = (note.content || '').toLowerCase();
        let matchType = null;

        if (title.includes(query)) {
          matchType = 'title';
        } else if (content.includes(query)) {
          matchType = 'content';
        }

        if (matchType) {
          let snippet = '';
          if (matchType === 'content' && note.content) {
            const idx = content.indexOf(query);
            const start = Math.max(0, idx - 20);
            const end = Math.min(note.content.length, idx + query.length + 30);
            snippet = (start > 0 ? '...' : '') + note.content.substring(start, end) + (end < note.content.length ? '...' : '');
          } else if (matchType === 'title') {
            snippet = note.content ? note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '') : '';
          }
          results.push({
            unitIndex,
            unitTitle: unit.title || `单元 ${unitIndex + 1}`,
            note,
            matchType,
            snippet
          });
        }
      });
    });

    // 搜索战斗部署
    const board = AppState.currentModule && AppState.currentModule.board;
    if (board && board.battleDeployments) {
      board.battleDeployments.forEach(battle => {
        let matched = false;
        let matchType = null;
        let matchField = '';
        let matchText = '';

        // 搜索战斗名称
        const bName = (battle.name || '').toLowerCase();
        if (bName.includes(query)) {
          matched = true; matchType = 'title'; matchField = 'name'; matchText = battle.name || '';
        }

        // 搜索参与者
        if (!matched && battle.participants) {
          for (const p of battle.participants) {
            const pName = (p.instanceName || '').toLowerCase();
            const pNotes = (p.resourceNotes || '').toLowerCase();
            if (pName.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'participant'; matchText = p.instanceName || '';
              break;
            }
            if (pNotes.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'resourceNotes'; matchText = p.resourceNotes || '';
              break;
            }
          }
        }

        // 搜索战场笔记
        if (!matched && battle.battlefieldNotes) {
          const bfKeys = ['terrain', 'cover', 'lighting', 'generalNotes'];
          for (const k of bfKeys) {
            const v = (battle.battlefieldNotes[k] || '').toLowerCase();
            if (v.includes(query)) {
              matched = true; matchType = 'content'; matchField = k; matchText = battle.battlefieldNotes[k] || '';
              break;
            }
          }
        }

        // 搜索触发器
        if (!matched && battle.triggers) {
          for (const t of battle.triggers) {
            // condition 是对象而非字符串，需先转为可读文本
            let condText = '';
            if (t.condition && typeof t.condition === 'object') {
              if (t.type === 'hp_threshold') condText = 'HP≤' + (t.condition.value || '') + '%';
              else if (t.type === 'round') condText = '第' + (t.condition.round || '') + '回合';
              else if (t.type === 'death') condText = '死亡时';
            } else {
              condText = String(t.condition || '');
            }
            const cond = condText.toLowerCase();
            const msg = (t.message || '').toLowerCase();
            if (cond.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'trigger'; matchText = condText;
              break;
            }
            if (msg.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'trigger'; matchText = t.message || '';
              break;
            }
          }
        }

        if (matched) {
          let snippet = '';
          if (matchType === 'content' && matchText) {
            const lower = matchText.toLowerCase();
            const idx = lower.indexOf(query);
            const start = Math.max(0, idx - 20);
            const end = Math.min(matchText.length, idx + query.length + 30);
            snippet = (start > 0 ? '...' : '') + matchText.substring(start, end) + (end < matchText.length ? '...' : '');
          } else if (matchType === 'title') {
            const pc = battle.participants ? battle.participants.length : 0;
            snippet = pc > 0 ? `${pc} 名参与者` : '';
          }
          results.push({
            unitIndex: -1,
            unitTitle: '战斗部署',
            note: { id: battle.id, type: '__battle__', title: battle.name, content: '' },
            matchType,
            snippet,
            sourceType: 'battle'
          });
        }
      });
    }

    if (countEl) countEl.textContent = `${results.length} 个结果`;
    this._renderBoardSearchResults(results, query);

    const matchedIds = new Set(results.map(r => r.note.id));
    this._applyBoardSearchFilter(matchedIds);
  },

  _rulebookSearchResults: [],

  /* 执行带团板搜索（包含规则书） */
  performBoardSearch() {
    const input = document.getElementById('boardSearchInput');
    if (!input) return;
    const query = input.value.trim().toLowerCase();
    const countEl = document.getElementById('boardSearchCount');
    const resultsEl = document.getElementById('boardSearchResults');

    if (!query) {
      this._clearBoardSearchFilter();
      if (resultsEl) resultsEl.classList.remove('visible');
      if (countEl) countEl.textContent = '';
      this._rulebookSearchResults = [];
      return;
    }

    const units = this.getFlowUnits();
    const results = [];

    units.forEach((unit, unitIndex) => {
      if (!unit.notes) return;
      unit.notes.forEach(note => {
        const title = (note.title || '').toLowerCase();
        const content = (note.content || '').toLowerCase();
        let matchType = null;

        if (title.includes(query)) {
          matchType = 'title';
        } else if (content.includes(query)) {
          matchType = 'content';
        }

        if (matchType) {
          let snippet = '';
          if (matchType === 'content' && note.content) {
            const idx = content.indexOf(query);
            const start = Math.max(0, idx - 20);
            const end = Math.min(note.content.length, idx + query.length + 30);
            snippet = (start > 0 ? '...' : '') + note.content.substring(start, end) + (end < note.content.length ? '...' : '');
          }

          results.push({
            unitIndex,
            unitTitle: unit.title || `单元 ${unitIndex + 1}`,
            note,
            matchType,
            snippet,
            sourceType: 'board'
          });
        }
      });
    });

    const board = AppState.currentModule && AppState.currentModule.board;
    if (board && board.battleDeployments) {
      board.battleDeployments.forEach(battle => {
        let matched = false;
        let matchType = null;
        let matchField = '';
        let matchText = '';

        const bName = (battle.name || '').toLowerCase();
        if (bName.includes(query)) {
          matched = true; matchType = 'title'; matchField = 'name'; matchText = battle.name || '';
        }

        if (!matched && battle.participants) {
          for (const p of battle.participants) {
            const pName = (p.instanceName || '').toLowerCase();
            const pNotes = (p.resourceNotes || '').toLowerCase();
            if (pName.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'participant'; matchText = p.instanceName || '';
              break;
            }
            if (pNotes.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'resourceNotes'; matchText = p.resourceNotes || '';
              break;
            }
          }
        }

        if (!matched && battle.battlefieldNotes) {
          const bfKeys = ['terrain', 'cover', 'lighting', 'generalNotes'];
          for (const k of bfKeys) {
            const v = (battle.battlefieldNotes[k] || '').toLowerCase();
            if (v.includes(query)) {
              matched = true; matchType = 'content'; matchField = k; matchText = battle.battlefieldNotes[k] || '';
              break;
            }
          }
        }

        if (!matched && battle.triggers) {
          for (const t of battle.triggers) {
            let condText = '';
            if (t.condition && typeof t.condition === 'object') {
              if (t.type === 'hp_threshold') condText = 'HP≤' + (t.condition.value || '') + '%';
              else if (t.type === 'round') condText = '第' + (t.condition.round || '') + '回合';
              else if (t.type === 'death') condText = '死亡时';
            } else {
              condText = String(t.condition || '');
            }
            const cond = condText.toLowerCase();
            const msg = (t.message || '').toLowerCase();
            if (cond.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'trigger'; matchText = condText;
              break;
            }
            if (msg.includes(query)) {
              matched = true; matchType = 'content'; matchField = 'trigger'; matchText = t.message || '';
              break;
            }
          }
        }

        if (matched) {
          let snippet = '';
          if (matchType === 'content' && matchText) {
            const lower = matchText.toLowerCase();
            const idx = lower.indexOf(query);
            const start = Math.max(0, idx - 20);
            const end = Math.min(matchText.length, idx + query.length + 30);
            snippet = (start > 0 ? '...' : '') + matchText.substring(start, end) + (end < matchText.length ? '...' : '');
          } else if (matchType === 'title') {
            const pc = battle.participants ? battle.participants.length : 0;
            snippet = pc > 0 ? `${pc} 名参与者` : '';
          }
          results.push({
            unitIndex: -1,
            unitTitle: '战斗部署',
            note: { id: battle.id, type: '__battle__', title: battle.name, content: '' },
            matchType,
            snippet,
            sourceType: 'battle'
          });
        }
      });
    }

    // 搜索文档内容
    const doc = AppState.currentModule && AppState.currentModule.document;
    if (doc) {
      const docTitle = (doc.title || '').toLowerCase();
      const docContent = (doc.rawText || doc.htmlContent || '').toLowerCase();
      if (docTitle.includes(query) || docContent.includes(query)) {
        let matchType = docTitle.includes(query) ? 'title' : 'content';
        let snippet = '';
        let searchText = docTitle.includes(query) ? doc.title : (doc.rawText || '');
        if (matchType === 'content' && searchText) {
          const idx = searchText.toLowerCase().indexOf(query);
          const start = Math.max(0, idx - 20);
          const end = Math.min(searchText.length, idx + query.length + 30);
          snippet = (start > 0 ? '...' : '') + searchText.substring(start, end) + (end < searchText.length ? '...' : '');
        }
        results.push({
          unitIndex: -1,
          unitTitle: '文档编辑器',
          note: { id: '__document__', type: '__document__', title: doc.title || '未命名文档', content: '' },
          matchType,
          snippet,
          sourceType: 'document'
        });
      }
    }

    this._rulebookSearchResults = (SystemManager.getCurrentSystem() === 'dnd5r')
      ? RulebookManager.search(query)
      : [];

    const totalCount = results.length + this._rulebookSearchResults.length;
    if (countEl) countEl.textContent = `${totalCount} 个结果`;
    this._renderBoardSearchResults(results, query);

    const matchedIds = new Set(results.map(r => r.note.id));
    this._applyBoardSearchFilter(matchedIds);
  },
  _renderBoardSearchResults(results, query) {
    const resultsEl = document.getElementById('boardSearchResults');
    if (!resultsEl) return;

    if (results.length === 0 && this._rulebookSearchResults.length === 0) {
      resultsEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;text-align:center;">无匹配结果</div>';
      resultsEl.classList.add('visible');
      return;
    }

    // 分离便签结果和战斗部署结果和文档结果
    const noteResults = results.filter(r => r.sourceType !== 'battle' && r.sourceType !== 'document');
    const battleResults = results.filter(r => r.sourceType === 'battle');

    const groups = {};
    noteResults.forEach(r => {
      const type = r.note.type || 'other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    });

    const escQ = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hl = (text, q) => {
      let h = this._esc(text);
      if (q) {
        const regex = new RegExp(`(${escQ(q)})`, 'gi');
        h = h.replace(regex, '<span class="bsr-highlight">$1</span>');
      }
      return h;
    };

    let html = '';
    for (const [type, items] of Object.entries(groups)) {
      const cfg = DatabaseManager.getMergedDbConfig()[type];
      const typeName = cfg ? cfg.name : type;
      const iconId = cfg ? cfg.icon : 'i-folder';

      html += `<div class="bsr-group-header"><svg><use href="#${iconId}"/></svg>${this._esc(typeName)} (${items.length})</div>`;
      items.forEach(item => {
        // 纯文本框和纯文字元素用 content 摘要代替"未命名"
        let title;
        if ((item.note.type === 'plaintext' || item.note.type === 'text') && !item.note.title) {
          const c = item.note.content || '';
          title = c.length > 25 ? c.substring(0, 25) + '...' : c;
        } else {
          title = item.note.title || '未命名';
        }
        const titleHtml = hl(title, query);
        const snippetHtml = hl(item.snippet || '', query);

        html += `<div class="bsr-item" onclick="BoardManager._navigateToBoardSearchResult(${item.unitIndex}, '${item.note.id}')">`;
        html += `<span class="bsr-title">${titleHtml}</span>`;
        if (snippetHtml) html += `<span class="bsr-snippet">${snippetHtml}</span>`;
        html += `<span class="bsr-unit">${this._esc(item.unitTitle)}</span>`;
        html += `</div>`;
      });
    }

    // 文档编辑器分组
    const documentResults = results.filter(r => r.sourceType === 'document');
    if (documentResults.length > 0) {
      html += `<div class="bsr-group-header"><svg><use href="#i-file-text"/></svg>文档匹配 (${documentResults.length})</div>`;
      documentResults.forEach(item => {
        const titleHtml = hl(item.note.title || '未命名文档', query);
        const snippetHtml = hl(item.snippet || '', query);

        html += `<div class="bsr-item" onclick="UIRender.switchPage('editor')">`;
        html += `<span class="bsr-title">${titleHtml}</span>`;
        if (snippetHtml) html += `<span class="bsr-snippet">${snippetHtml}</span>`;
        html += `<span class="bsr-unit">文档编辑器</span>`;
        html += `</div>`;
      });
    }

    // 战斗部署分组
    if (battleResults.length > 0) {
      html += `<div class="bsr-group-header"><svg><use href="#i-shield"/></svg>战斗部署 (${battleResults.length})</div>`;
      battleResults.forEach(item => {
        const titleHtml = hl(item.note.title || '未命名战斗', query);
        const snippetHtml = hl(item.snippet || '', query);

        html += `<div class="bsr-item" onclick="BoardManager._navigateToBoardSearchResult(-1, '${item.note.id}')">`;
        html += `<span class="bsr-title">${titleHtml}</span>`;
        if (snippetHtml) html += `<span class="bsr-snippet">${snippetHtml}</span>`;
        html += `<span class="bsr-unit">战斗部署</span>`;
        html += `</div>`;
      });
    }

    // 规则书分组
    if (this._rulebookSearchResults.length > 0) {
      html += `<div class="bsr-group-header"><svg><use href="#i-book"/></svg>规则书 (${this._rulebookSearchResults.length})</div>`;
      this._rulebookSearchResults.forEach(item => {
        const titleHtml = hl(item.item.name, query);
        const typeLabel = RulebookManager.getTypeLabel(item.type);
        const typeIcon = RulebookManager.getTypeIcon(item.type);
        
        let snippet = '';
        if (item.item.description) {
          snippet = item.item.description.length > 50 ? item.item.description.substring(0, 50) + '...' : item.item.description;
        } else if (item.item.statBlock) {
          snippet = '包含详细数据';
        }
        const snippetHtml = hl(snippet, query);

        html += `<div class="bsr-item bsr-rulebook-item" onclick="BoardManager._showRulebookDetail('${item.item.id}', '${item.type}')">`;
        html += `<span class="bsr-rulebook-icon">${typeIcon}</span>`;
        html += `<span class="bsr-title">${titleHtml}</span>`;
        if (snippetHtml) html += `<span class="bsr-snippet">${snippetHtml}</span>`;
        html += `<span class="bsr-unit">${typeLabel}</span>`;
        html += `</div>`;
      });
    }

    resultsEl.innerHTML = html;
    resultsEl.classList.add('visible');
  },

  _showRulebookDetail(itemId, type) {
    const result = RulebookManager.getItemById(itemId);
    if (!result) return;
    
    const { item } = result;
    const typeLabel = RulebookManager.getTypeLabel(type);
    const typeIcon = RulebookManager.getTypeIcon(type);
    
    let detailHtml = `<div class="rulebook-detail-header">`;
    detailHtml += `<span class="rulebook-detail-icon">${typeIcon}</span>`;
    detailHtml += `<div class="rulebook-detail-title-wrap">`;
    detailHtml += `<h3 class="rulebook-detail-title">${this._esc(item.name)}</h3>`;
    if (item.englishName) {
      detailHtml += `<span class="rulebook-detail-english">${this._esc(item.englishName)}</span>`;
    }
    detailHtml += `</div>`;
    detailHtml += `<button class="rulebook-detail-close" onclick="BoardManager._closeRulebookDetail()">×</button>`;
    detailHtml += `</div>`;
    
    detailHtml += `<div class="rulebook-detail-body">`;
    
    if (item.category) {
      detailHtml += `<div class="rulebook-detail-row"><span class="rulebook-detail-label">分类</span><span class="rulebook-detail-value">${this._esc(item.category)}</span></div>`;
    }
    if (item.type) {
      detailHtml += `<div class="rulebook-detail-row"><span class="rulebook-detail-label">类型</span><span class="rulebook-detail-value">${this._esc(item.type)}</span></div>`;
    }
    if (item.rarity) {
      detailHtml += `<div class="rulebook-detail-row"><span class="rulebook-detail-label">稀有度</span><span class="rulebook-detail-value">${this._esc(item.rarity)}</span></div>`;
    }
    if (item.level !== undefined && item.level !== null) {
      detailHtml += `<div class="rulebook-detail-row"><span class="rulebook-detail-label">等级</span><span class="rulebook-detail-value">${this._esc(item.level)}</span></div>`;
    }
    if (item.prerequisite) {
      detailHtml += `<div class="rulebook-detail-row"><span class="rulebook-detail-label">前置要求</span><span class="rulebook-detail-value">${this._esc(item.prerequisite)}</span></div>`;
    }
    
    if (item.description) {
      detailHtml += `<div class="rulebook-detail-section"><h4>描述</h4><div class="rulebook-detail-desc">${item.description.replace(/\n/g, '<br>')}</div></div>`;
    }
    
    if (item.statBlock) {
      detailHtml += `<div class="rulebook-detail-section"><h4>数据</h4><div class="rulebook-detail-statblock">`;
      for (const [key, value] of Object.entries(item.statBlock)) {
        detailHtml += `<div class="rulebook-stat-row"><span class="rulebook-stat-label">${this._esc(key)}</span><span class="rulebook-stat-value">${this._esc(String(value))}</span></div>`;
      }
      detailHtml += `</div></div>`;
    }
    
    detailHtml += `</div>`;
    
    let container = document.getElementById('rulebookDetailContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'rulebookDetailContainer';
      container.className = 'rulebook-detail-container';
      document.body.appendChild(container);
    }
    container.innerHTML = detailHtml;
    container.classList.add('visible');
  },

  _closeRulebookDetail() {
    const container = document.getElementById('rulebookDetailContainer');
    if (container) {
      container.classList.remove('visible');
    }
  },

  /* 导航到搜索结果便签 */
  _navigateToBoardSearchResult(unitIndex, noteId) {
    const resultsEl = document.getElementById('boardSearchResults');

    // 战斗部署导航
    if (unitIndex === -1) {
      const battle = this._getBattle(noteId);
      if (!battle) return;
      const vpEl = document.getElementById('boardViewport');
      const viewW = vpEl ? vpEl.clientWidth : 800;
      const viewH = vpEl ? vpEl.clientHeight : 600;
      const scale = this.scale || 1;
      const cardW = 260, cardH = 200;
      const newX = battle.x + cardW / 2 - viewW / (2 * scale);
      const newY = battle.y + cardH / 2 - viewH / (2 * scale);
      const currentUnit = this.getCurrentUnit();
      if (currentUnit) currentUnit.viewport = { x: newX, y: newY, scale: scale };
      this.viewport = { x: newX, y: newY };
      this._updateCanvasTransform();
      this.renderMinimap();
      // 高亮闪烁战斗卡片
      const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
      if (canvas) {
        const cardEl = canvas.querySelector(`[data-battle-id="${noteId}"]`);
        if (cardEl) {
          cardEl.style.transition = 'box-shadow 0.3s ease';
          cardEl.style.boxShadow = '0 0 0 3px var(--accent), 0 0 16px rgba(59,130,246,0.4)';
          setTimeout(() => {
            cardEl.style.boxShadow = '';
            setTimeout(() => { cardEl.style.transition = ''; }, 300);
          }, 1500);
        }
      }
      if (resultsEl) resultsEl.classList.remove('visible');
      return;
    }

    const units = this.getFlowUnits();
    const unit = units[unitIndex];
    if (!unit) return;
    const note = unit.notes.find(n => n.id === noteId);
    if (!note) return;

    if (this.currentUnitIndex !== unitIndex) {
      this.goToUnit(unitIndex);
    }

    const vpEl = document.getElementById('boardViewport');
    const viewW = vpEl ? vpEl.clientWidth : 800;
    const viewH = vpEl ? vpEl.clientHeight : 600;
    const scale = this.scale || 1;
    const noteW = note.width || 240;
    const noteH = note.height || 150;
    const newX = note.x + noteW / 2 - viewW / (2 * scale);
    const newY = note.y + noteH / 2 - viewH / (2 * scale);

    const currentUnit = this.getCurrentUnit();
    if (currentUnit) {
      currentUnit.viewport = { x: newX, y: newY, scale: scale };
    }
    this.viewport = { x: newX, y: newY };
    this._updateCanvasTransform();
    this.renderMinimap();

    // 高亮闪烁目标便签
    const canvas = document.getElementById('unitCanvas_' + unitIndex);
    if (canvas) {
      const noteEl = canvas.querySelector(`[data-note-id="${noteId}"]`);
      if (noteEl) {
        noteEl.style.transition = 'box-shadow 0.3s ease';
        noteEl.style.boxShadow = '0 0 0 3px var(--accent), 0 0 16px rgba(59,130,246,0.4)';
        setTimeout(() => {
          noteEl.style.boxShadow = '';
          setTimeout(() => { noteEl.style.transition = ''; }, 300);
        }, 1500);
      }
    }

    if (resultsEl) resultsEl.classList.remove('visible');
  },

  /* 实时过滤：降低非匹配便签透明度 */
  _applyBoardSearchFilter(matchedNoteIds) {
    const canvas = document.getElementById('unitCanvas_' + this.currentUnitIndex);
    if (!canvas) return;
    canvas.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card').forEach(el => {
      if (matchedNoteIds.has(el.dataset.noteId)) {
        el.classList.add('search-highlight');
        el.classList.remove('search-dimmed');
      } else {
        el.classList.add('search-dimmed');
        el.classList.remove('search-highlight');
      }
    });
  },

  /* 清除搜索过滤 */
  _clearBoardSearchFilter() {
    document.querySelectorAll('.note-card, .plain-text-block, .canvas-text-el, .canvas-image, .battle-deploy-card').forEach(el => {
      el.classList.remove('search-dimmed', 'search-highlight');
    });
  },


  /* 初始化搜索输入框 */
  _initBoardSearchInput() {
    const input = document.getElementById('boardSearchInput');
    if (!input) return;

    input.addEventListener('input', () => {
      clearTimeout(this._boardSearchDebounceTimer);
      this._boardSearchDebounceTimer = setTimeout(() => this.performBoardSearch(), 300);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.performBoardSearch();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.toggleSearch();
      }
    });

  },

  /* ==================== 工具方法 ==================== */

  /* HTML 转义 */
  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  /* ==========================================================================
   * 战斗部署模块 (Battle Deployment Module)
   * ========================================================================== */

  /* ---------- 运行时状态 ---------- */
  _currentBattleId: null,       // 当前打开的战斗部署模块 ID
  _boAction: null,              // 当前选中的行动类型: 'damage'|'heal'|'tempHp'|'status'
  _boTargetMode: false,         // 是否处于目标选择模式
  _boSelectedTargets: [],       // 已选择的目标 participantId 列表
  _boRightTab: 'log',          // 右侧面板当前标签
  _boCurrentActionPid: null,   // 当前行动面板展示的角色pid
  _boStatusPickerTarget: null,  // 状态选择器的目标 participantId
  _boStatusTargetMode: false,   // 是否处于状态施加目标选择模式（替代猴子补丁）
  _boWorldClockAccumulator: 0,  // 世界时钟小数累积器（秒→分钟进位）
  _boCanvasCleanup: null,        // 画布事件清理函数引用
  _boCanvasState: { x: 0, y: 0, scale: 1, panning: false, startX: 0, startY: 0, startVpX: 0, startVpY: 0 },
  _boIsConnecting: false,
  _boIsErasingConnections: false,
  _boWaitForConnectSource: false,
  _boIsDragging: false,
  _boConnectSourcePid: null,
  _boPendingConnectionColor: '#c0ab84',
  _boSelectedBgFrame: null,      // 当前选中的背景框 ID
  _boBgFrameDragging: false,     // 背景框拖拽中

  /* ---------- 数据访问 ---------- */
  _getBattleDeployments() {
    const mod = AppState.currentModule;
    if (!mod) return [];
    if (!mod.board.battleDeployments) mod.board.battleDeployments = [];
    return mod.board.battleDeployments;
  },

  _getBattle(id) {
    return this._getBattleDeployments().find(b => b.id === id);
  },

  _getCurrentBattle() {
    return this._currentBattleId ? this._getBattle(this._currentBattleId) : null;
  },

  _getParticipant(battle, pId) {
    return battle ? battle.participants.find(p => p.id === pId) : null;
  },

  /* 获取参战角色对应的 combatTracker */
  _getCombatTracker(participant) {
    if (!participant) return null;
    // 首个实例（instanceIndex === 0）始终回退到源便签的 combatTracker，确保HP同步
    if (participant.instanceIndex === 0) {
      if (!participant.sourceNoteId) return null;
      const note = this._findNoteGlobal(participant.sourceNoteId);
      if (note && note.combatTracker) return note.combatTracker;
      return null;
    }
    // 多副本实例使用独立的 combatTracker
    if (participant.combatTracker) return participant.combatTracker;
    // 回退到源便签的 combatTracker（向后兼容）
    if (!participant.sourceNoteId) return null;
    const note = this._findNoteGlobal(participant.sourceNoteId);
    if (note && note.combatTracker) return note.combatTracker;
    return null;
  },

  /* 获取参战角色的角色数据（优先自身副本，回退源便签） */
  _getParticipantCharData(participant) {
    if (!participant) return {};
    if (!participant.sourceNoteId) return {};
    const note = this._findNoteGlobal(participant.sourceNoteId);
    return (note && note.characterData) ? note.characterData : {};
  },

  /* 全局查找便签（跨所有流程单元） */
  _findNoteGlobal(noteId) {
    const mod = AppState.currentModule;
    if (!mod) return null;
    for (const unit of mod.board.flowUnits) {
      const note = unit.notes.find(n => n.id === noteId);
      if (note) return note;
    }
    return null;
  },

  /* ---------- 创建战斗部署模块 ---------- */
  createBattleDeployment() {
    const unit = this.getCurrentUnit();
    if (!unit) return;
    const battle = {
      id: AppState.generateUUID(),
      unitIndex: this.currentUnitIndex,
      name: '新战斗',
      participants: [],
      turnTracker: { currentRound: 0, currentIndex: 0, isActive: false, orderedIds: [] },
      combatLog: [],
      triggers: [],
      battlefieldNotes: { terrain: '', cover: '', lighting: '', generalNotes: '' },
      statistics: { totalRounds: 0, damageByCharacter: {}, healingByCharacter: {}, damageTakenByCharacter: {}, nearDeathEvents: [], statusEvents: [], killEvents: [] },
      canvas: { viewport: { x: 0, y: 0, scale: 1 }, notes: [], connections: [], backgroundFrames: [] },
      template: { isTemplate: false, templateName: '', includeCharacterData: false },
      x: (this._screenToVirtual ? this._screenToVirtual(window.innerWidth / 2, window.innerHeight / 2).x + (this._getUnitViewport ? this._getUnitViewport().x : 0) : 200) + (Math.random() - 0.5) * 60,
      y: (this._screenToVirtual ? this._screenToVirtual(window.innerWidth / 2, window.innerHeight / 2).y + (this._getUnitViewport ? this._getUnitViewport().y : 0) : 200) + (Math.random() - 0.5) * 60
    };
    this._getBattleDeployments().push(battle);
    this._renderBattleDeployCard(battle, unit);
    StorageManager.scheduleSave();
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('battleDeploymentCreated', { battleId: battle.id });
    }
  },

  /* ---------- 渲染画布上的战斗部署卡片 ---------- */
  _renderBattleDeployCard(battle, unit) {
    const targetUnit = battle.unitIndex != null ? battle.unitIndex : this.currentUnitIndex;
    const canvas = document.getElementById('unitCanvas_' + targetUnit);
    if (!canvas) return;
    // 移除旧的
    const old = document.getElementById('bdc_' + battle.id);
    if (old) old.remove();

    const card = document.createElement('div');
    card.className = 'battle-deploy-card' + (battle.ended ? ' ended' : '');
    card.id = 'bdc_' + battle.id;
    card.style.left = battle.x + 'px';
    card.style.top = battle.y + 'px';
    card.setAttribute('data-battle-id', battle.id);
    card.setAttribute('data-note-id', battle.id);

    const pCount = battle.participants.length;
    const dotsHtml = battle.participants.map(p => {
      const cls = p.faction || 'enemy_npc';
      return '<div class="bdc-participant-dot ' + cls + '" title="' + this._esc(p.instanceName) + '"></div>';
    }).join('');

    const statusText = battle.ended ? '已结束' : (battle.turnTracker.isActive ? '进行中' : '准备中');
    const endBtnLabel = battle.ended ? '继续战斗' : '结束战斗';
    const endBtnClass = battle.ended ? 'bdc-end-btn resumed' : 'bdc-end-btn';

    card.innerHTML =
      '<div class="bdc-glow"></div>' +
      '<div class="bdc-header">' +
        '<div class="bdc-icon">\u2694</div>' +
        '<span class="bdc-title" title="双击重命名">' + this._esc(battle.name) + '</span>' +
        '<span class="bdc-edit-hint" data-tooltip="重命名" onclick="event.stopPropagation(); BoardManager._boStartRenameBattle(\'' + battle.id + '\', this.parentElement.querySelector(\'.bdc-title\'))"><svg viewBox="0 0 24 24" width="12" height="12" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>' +
        '<span class="bdc-badge">' + pCount + ' 人参战</span>' +
      '</div>' +
      '<div class="bdc-body">' +
        '<div class="bdc-stats">' +
          '<div class="bdc-stat"><span class="bdc-stat-label">回合</span><span class="bdc-stat-value">' + battle.turnTracker.currentRound + '</span></div>' +
          '<div class="bdc-stat"><span class="bdc-stat-label">状态</span><span class="bdc-stat-value">' + statusText + '</span></div>' +
        '</div>' +
        '<div class="bdc-participants">' + dotsHtml + '</div>' +
        '<div class="bdc-actions">' +
          '<button class="bdc-open-btn" onclick="event.stopPropagation(); BoardManager.openBattleOverlay(\'' + battle.id + '\')">' + (battle.turnTracker.isActive ? '继续战斗' : '打开战斗') + '</button>' +
          '<button class="' + endBtnClass + '" onclick="event.stopPropagation(); BoardManager._boToggleEndBattle(\'' + battle.id + '\')">' + endBtnLabel + '</button>' +
          '<button class="bdc-del-btn" onclick="event.stopPropagation(); BoardManager.deleteBattleDeployment(\'' + battle.id + '\')" title="删除">\u00D7</button>' +
        '</div>' +
      '</div>';

    // 标题双击重命名
    const titleEl = card.querySelector('.bdc-title');
    titleEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this._boStartRenameBattle(battle.id, titleEl);
    });
    // 拖拽
    card.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        if (this._waitingForConnectSource || this.isConnecting) {
          this._exitConnectMode();
        }
        return;
      }
      // 连线模式检查（优先于按钮守卫）
      if (this._waitingForConnectSource) {
        this._waitingForConnectSource = false;
        this.startConnection(battle.id, this.currentUnitIndex);
        return;
      }
      if (this.isConnecting && this._connectingUnitIndex === this.currentUnitIndex) {
        if (this.connectingFrom !== battle.id) {
          this.completeConnection(battle.id, this.currentUnitIndex);
        }
        return;
      }
      // 以下守卫仅在非连线模式生效
      if (e.target.closest('.bdc-open-btn') || e.target.closest('.bdc-del-btn') || e.target.closest('.bdc-end-btn')) return;
      if (this._isErasingConnections) return;
      this._startBattleCardDrag(e, battle.id);
    });
    // 空白处双击打开战斗
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('.bdc-title')) return;
      e.stopPropagation();
      this.openBattleOverlay(battle.id);
    });
    // 右键菜单
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waitingForConnectSource || this.isConnecting) {
        this._exitConnectMode();
        return;
      }
      if (this._isErasingConnections) {
        this._exitEraseMode();
        return;
      }
      this._showBattleCardContextMenu(e, battle.id);
    });

    canvas.appendChild(card);
  },

  _startBattleCardDrag(e, battleId) {
    e.preventDefault();
    const card = document.getElementById('bdc_' + battleId);
    if (!card) return;
    const battle = this._getBattle(battleId);
    if (!battle) return;
    const startX = e.clientX, startY = e.clientY;
    const origX = battle.x, origY = battle.y;
    card.classList.add('dragging');
    const onMove = (ev) => {
      const s = this.scale || 1;
      battle.x = origX + (ev.clientX - startX) / s;
      battle.y = origY + (ev.clientY - startY) / s;
      card.style.left = battle.x + 'px';
      card.style.top = battle.y + 'px';
      this.renderConnections(this.currentUnitIndex);
    };
    const onUp = () => {
      card.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      StorageManager.scheduleSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* 双击卡片标题进入重命名 */
  _boStartRenameBattle(battleId, titleEl) {
    const battle = this._getBattle(battleId);
    if (!battle) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = battle.name;
    input.className = 'bdc-title-input';
    input.style.cssText = 'background:rgba(0,0,0,0.3);border:1px solid rgba(212,168,83,0.5);border-radius:4px;color:#e8e0d0;font-size:13px;font-weight:600;padding:2px 6px;width:100%;outline:none;';
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    // 替换编辑图标为确认按钮
    const editHint = input.parentElement.querySelector('.bdc-edit-hint');
    if (editHint) {
      const confirmBtn = document.createElement('span');
      confirmBtn.className = 'bdc-confirm-btn';
      confirmBtn.setAttribute('data-tooltip', '确认');
      confirmBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" style="stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"/></svg>';
      confirmBtn.addEventListener('mousedown', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const newName = input.value.trim() || battle.name;
        battle.name = newName;
        this._renderBattleDeployCard(battle, this.getCurrentUnit());
        this.saveBoard();
        StorageManager.scheduleSave();
      });
      editHint.replaceWith(confirmBtn);
    }
    const commit = () => {
      const newName = input.value.trim() || battle.name;
      battle.name = newName;
      this._renderBattleDeployCard(battle, this.getCurrentUnit());
      this.saveBoard();
      StorageManager.scheduleSave();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = battle.name; input.blur(); }
    });
  },

  /* 战斗卡片右键菜单 */
  _showBattleCardContextMenu(e, battleId) {
    const existing = document.getElementById('noteContextMenu');
    if (existing) { existing.classList.remove('visible'); existing.style.left = ''; existing.style.top = ''; }
    const old = document.getElementById('battleCardContextMenu');
    if (old) old.remove();

    this.contextNoteId = battleId;
    this.contextUnitIndex = this.currentUnitIndex;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'battleCardContextMenu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const battle = this._getBattle(battleId);
    const endLabel = (battle && battle.ended) ? '继续战斗' : '结束战斗';

    menu.innerHTML = `
      <div class="ctx-menu-item" onclick="BoardManager.openBattleOverlay('${battleId}'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></span> 打开战斗
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.startConnectionFromContext(); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></span> 连线到...
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${battleId}', ${this.currentUnitIndex}, 'front'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="18 15 12 9 6 15"/></svg></span> 置于顶层
      </div>
      <div class="ctx-menu-item" onclick="BoardManager._adjustLayer('${battleId}', ${this.currentUnitIndex}, 'back'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg></span> 置于底层
      </div>
      <div class="ctx-menu-sep"></div>
      <div class="ctx-menu-item" onclick="BoardManager._boToggleEndBattle('${battleId}'); BoardManager.hideContextMenu();">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span> ${endLabel}
      </div>
      <div class="ctx-menu-item" onclick="BoardManager.deleteBattleDeployment('${battleId}'); BoardManager.hideContextMenu();" style="color:#a03030;">
        <span class="icon"><svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></span> 删除
      </div>
    `;

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';

    setTimeout(() => {
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      document.addEventListener('mousedown', closeHandler);
    }, 10);
  },

  /* 切换战斗结束/继续状态 */
  _boToggleEndBattle(battleId) {
    const battle = this._getBattle(battleId);
    if (!battle) return;
    battle.ended = !battle.ended;
    this._renderBattleDeployCard(battle, this.getCurrentUnit());
    this.saveBoard();
    StorageManager.scheduleSave();
    DocEditor.showToast(battle.ended ? '已标记战斗结束' : '已恢复战斗状态', 'success');
  },

  deleteBattleDeployment(battleId) {
    const deps = this._getBattleDeployments();
    const idx = deps.findIndex(b => b.id === battleId);
    if (idx === -1) return;
    deps.splice(idx, 1);
    const card = document.getElementById('bdc_' + battleId);
    if (card) card.remove();
    StorageManager.scheduleSave();
  },

  /* ---------- 打开/关闭战斗覆盖层 ---------- */
  openBattleOverlay(battleId) {
    const battle = this._getBattle(battleId);
    if (!battle) return;
    this._currentBattleId = battleId;
    this._boAction = null;
    this._boTargetMode = false;
    this._boSelectedTargets = [];
    this._boRightTab = 'log';

    const overlay = document.getElementById('battleOverlay');
    document.getElementById('boTitle').textContent = battle.name;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active', 'entering'));
    setTimeout(() => overlay.classList.remove('entering'), 400);

    this._boRenderAll();
    this._boInitCanvas();
    this._boInitNotifyResize();
    this._boInitActionCardsDrag();

    // 自动显示当前回合角色的行动面板
    const battleTurn = this._getBattle(battleId);
    if (battleTurn && battleTurn.turnTracker) {
      const tt = battleTurn.turnTracker;
      const ord = tt.orderedIds;
      if (ord && ord.length > 0) {
        const curPid = ord[tt.currentIndex];
        if (curPid) this._boShowActionPanel(curPid);
      }
    }

    // 键盘快捷键
    if (this._boKeyHandler) document.removeEventListener('keydown', this._boKeyHandler);
    this._boKeyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (typeof TutorialManager !== 'undefined' && TutorialManager._isActive && !TutorialManager._isPaused) return;
      switch (e.key) {
        case 'Escape':
          this._boHideCanvasCtxMenu();
          if (this._boIsConnecting || this._boWaitForConnectSource) { this._boExitConnectMode(); }
          else if (this._boIsErasingConnections) { this._boExitEraseMode(); }
          else if (this._boDeleteMode) { this._boToggleDeleteMode(); }
          else if (this._boTargetMode) { this._boCancelTargetMode(); }
          else { this.closeBattleOverlay(); }
          break;
      }
    };
    document.addEventListener('keydown', this._boKeyHandler);
    if (typeof Tutorial !== 'undefined') {
      setTimeout(() => Tutorial.emit('battleOpened', { battleId }), 400);
    }
  },

  closeBattleOverlay() {
    const overlay = document.getElementById('battleOverlay');
    overlay.classList.remove('active');
    setTimeout(() => { overlay.style.display = 'none'; }, 350);
    // 清理画布事件监听器
    if (this._boCanvasCleanup) {
      this._boCanvasCleanup();
      this._boCanvasCleanup = null;
    }
    // 清理键盘监听器
    if (this._boKeyHandler) {
      document.removeEventListener('keydown', this._boKeyHandler);
      this._boKeyHandler = null;
    }
    this._currentBattleId = null;
    this._boAction = null;
    this._boTargetMode = false;
    this._boStatusTargetMode = false;
    this._boSelectedTargets = [];
    this._boDeleteMode = false;
    this._boDeleteSelected = [];
    // 退出连线/擦除模式
    this._boExitConnectMode();
    this._boExitEraseMode();
    // 隐藏提示气泡和箭头
    this._boHideTooltip();
    this._boHideArrow();
    this._boHideCanvasCtxMenu();
    // 关闭弹出面板
    document.getElementById('boAddParticipantPanel').style.display = 'none';
    document.getElementById('boStatusPicker').style.display = 'none';
    document.getElementById('boTriggerModal').style.display = 'none';
    const delBar = document.getElementById('boDeleteBar');
    if (delBar) delBar.style.display = 'none';
    const bottomArea = document.getElementById('boBottomArea');
    if (bottomArea) bottomArea.classList.remove('delete-expanded');
    // 重置添加面板transform
    const apPanel = document.getElementById('boAddParticipantPanel');
    if (apPanel) apPanel.style.transform = '';
    // 刷新外部卡片
    this._refreshCurrentBattleCard();
  },

  _refreshCurrentBattleCard() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const card = document.getElementById('bdc_' + battle.id);
    if (card) {
      const unit = this.getCurrentUnit();
      card.remove();
      this._renderBattleDeployCard(battle, unit);
    }
  },

  /* ---------- 渲染所有面板 ---------- */
  _boRenderAll() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const overlay = document.getElementById('battleOverlay');
    if (overlay) {
      const isCustom = typeof SystemManager !== 'undefined' && SystemManager.getCurrentSystem() !== 'dnd5r';
      overlay.classList.toggle('bo-custom-system', isCustom);
      // COC下隐藏"临时HP"和"施加状态"按钮
      const isCoc = typeof SystemManager !== 'undefined' && SystemManager.getCurrentSystem() === 'coc7';
      const tmpBtn = overlay.querySelector('.bo-action-btn[data-action="tempHp"]');
      const statusBtn = overlay.querySelector('.bo-action-btn[data-action="status"]');
      if (tmpBtn) tmpBtn.style.display = isCoc ? 'none' : '';
      if (statusBtn) statusBtn.style.display = isCoc ? 'none' : '';
    }
    this._boRenderTurnList();
    this._boRenderPanelContent();
    this._boUpdateHeader();
    this._boRenderCanvasNotes();
    this._boRenderBackgroundFrames();
    this._boRenderConnections();
    this._boRenderTriggerNotes();
    this._boRenderMinimap();
    this._boCheckTriggers();
    // 如果行动面板正在展示，同步刷新
    if (this._boCurrentActionPid) {
      this._boRenderActionPanel(this._boCurrentActionPid);
    }
  },

  _boUpdateHeader() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const tt = battle.turnTracker;
    document.getElementById('boRoundBadge').textContent = '第 ' + tt.currentRound + ' 轮';
    const totalSeconds = tt.currentRound * 6;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    document.getElementById('boTimeBadge').textContent = mins > 0 ? mins + '分' + secs + '秒' : secs + ' 秒';
  },

  /* ---------- 先攻序栏位列表（横向） ---------- */
  _boRenderTurnList() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const list = document.getElementById('boTurnList');
    const tt = battle.turnTracker;
    const ordered = tt.orderedIds.map(id => this._getParticipant(battle, id)).filter(Boolean);

    // 更新结束回合按钮文本
    const endBtn = document.getElementById('boEndTurnBtn');
    if (endBtn) {
      const label = endBtn.querySelector('.bo-end-turn-label');
      if (label) label.textContent = tt.isActive ? '结束回合' : '开始战斗';
    }

    if (ordered.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:20px 10px;color:rgba(255,255,255,0.2);font-size:11px;white-space:nowrap;">暂无参战 · 点击"+ 添加"</div>';
      return;
    }

    let html = '';
    ordered.forEach((p, idx) => {
      const ct = this._getCombatTracker(p);
      const isActive = tt.isActive && idx === tt.currentIndex;
      const isDelayed = p.isDelayed;
      const isReady = p.isReady;
      const isTarget = this._boSelectedTargets && this._boSelectedTargets.includes(p.id);
      const isDeletePick = this._boDeleteMode && this._boDeleteSelected && this._boDeleteSelected.includes(p.id);
      let cls = 'bo-turn-item';
      if (isActive) cls += ' active';
      if (isDelayed) cls += ' delayed';
      if (isReady) cls += ' ready';
      if (isTarget) cls += ' target-selected';
      if (isDeletePick) cls += ' delete-pick';

      const faction = p.faction || 'enemy_npc';
      const initial = (p.instanceName || '?').charAt(0);
      const pCd = this._getParticipantCharData(p);
      const maxHp = ct ? (ct.maxHp || this._parseMaxHp(pCd)) : null;
      const curHp = ct ? ct.currentHp : null;
      const tmpHp = ct ? (ct.tempHp || 0) : 0;
      const pct = (maxHp > 0 && curHp !== null) ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
      const hpClass = curHp === null ? '' : (curHp <= 0 ? 'hp-dead' : (pct <= 25 ? 'hp-low' : (pct <= 50 ? 'hp-mid' : 'hp-high')));
      const hpText = curHp !== null ? curHp + '/' + (maxHp || '?') : '--';

      // 状态图标
      let statusHtml = '';
      if (ct && ct.statuses.length > 0) {
        ct.statuses.forEach(s => {
          const sk = BoardManager.STATUS_KEYS[s.name] || 'custom';
          const expiring = s.duration === 1 && s.unit === 'rounds';
          const durLabel = s.duration ? '<span class="bo-status-dur">' + s.duration + '</span>' : '';
          statusHtml += '<div class="bo-turn-status-dot status-' + sk + '"' + (expiring ? ' style="animation:bdcPulse 1s ease-in-out infinite;"' : '') + ' title="' + this._esc(s.name) + (s.duration ? ' (' + s.duration + (s.unit === 'rounds' ? '轮' : '分') + ')' : '') + '">' + this._getStatusEmoji(s.name) + durLabel + '</div>';
        });
      }

      html += '<div class="' + cls + '" data-pid="' + p.id + '" data-initial="' + initial + '" onclick="BoardManager._boClickTurnItem(\'' + p.id + '\')">';
      html += '<div class="bo-turn-init' + (p.initiative === null ? ' empty' : '') + '" onclick="event.stopPropagation(); BoardManager._boEditInit(\'' + p.id + '\', this)">' + (p.initiative !== null ? p.initiative : 'init') + '</div>';
      html += '<div class="bo-turn-info">';
      html += '<div class="bo-turn-name">' + this._esc(p.instanceName) + '</div>';
      html += '<div class="bo-turn-hp-bar"><div class="bo-turn-hp-fill ' + hpClass + '" style="width:' + pct + '%"></div></div>';
      html += '<div class="bo-turn-hp-text">' + hpText + (tmpHp > 0 ? ' +' + tmpHp : '') + '</div>';
      html += '</div>';
      if (statusHtml) html += '<div class="bo-turn-statuses">' + statusHtml + '</div>';
      html += '</div>';
    });

    list.innerHTML = html;

    // 滚动到当前行动者
    if (tt.isActive) {
      const activeEl = list.querySelector('.bo-turn-item.active');
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  },

  _getStatusEmoji(name) {
    const map = { '目盲':'\u{1F441}', '魅惑':'\u2764', '耳聋':'\u{1F442}', '恐慌':'\u2757', '擒抱':'\u270A', '失能':'\u2716', '隐形':'\u{1F441}', '麻痹':'\u26A1', '石化':'\u{1FAA8}', '中毒':'\u2620', '倒地':'\u2B07', '束缚':'\u26D3', '震慑':'\u2B50', '昏迷':'\u{1F319}', '专注':'\u{1F535}' };
    return map[name] || '\u{1F3F7}';
  },

  _boClickTurnItem(pid) {
    if (this._boDeleteMode) {
      // 删除模式：切换选中状态
      if (!this._boDeleteSelected) this._boDeleteSelected = [];
      const idx = this._boDeleteSelected.indexOf(pid);
      if (idx >= 0) this._boDeleteSelected.splice(idx, 1);
      else this._boDeleteSelected.push(pid);
      this._boRenderTurnList();
      return;
    }
    if (this._boTargetMode) {
      // 目标选择模式：点击选择/取消目标
      const idx = this._boSelectedTargets.indexOf(pid);
      if (idx >= 0) this._boSelectedTargets.splice(idx, 1);
      else this._boSelectedTargets.push(pid);
      this._boUpdateConfirmBtn();
      this._boUpdateArrowOverlay();
      this._boRenderTurnList();
      this._boRenderCanvasNotes();
      return;
    }
    // 非目标模式：跳转到该角色便签
    this._boFocusParticipant(pid);
  },

  _boToggleDeleteMode() {
    this._boDeleteMode = !this._boDeleteMode;
    if (this._boDeleteMode) {
      // 进入删除模式时取消目标选择模式
      if (this._boTargetMode) this._boCancelTargetMode();
      this._boDeleteSelected = [];
    } else {
      this._boDeleteSelected = [];
    }
    const bar = document.getElementById('boDeleteBar');
    if (bar) bar.style.display = this._boDeleteMode ? 'flex' : 'none';
    const btn = document.getElementById('boDeleteModeBtn');
    if (btn) btn.classList.toggle('active', this._boDeleteMode);
    // 同步调整底部区域高度（带动画）
    const bottomArea = document.getElementById('boBottomArea') || document.querySelector('.bo-bottom-area');
    if (bottomArea) bottomArea.classList.toggle('delete-expanded', this._boDeleteMode);
    this._boRenderTurnList();
  },

  _boConfirmDelete() {
    if (!this._boDeleteSelected || this._boDeleteSelected.length === 0) return;
    const battle = this._getCurrentBattle();
    if (!battle) return;
    this._boDeleteSelected.forEach(pid => {
      this._boRemoveParticipant(pid);
    });
    this._boDeleteSelected = [];
    this._boDeleteMode = false;
    const bar = document.getElementById('boDeleteBar');
    if (bar) bar.style.display = 'none';
    const btn = document.getElementById('boDeleteModeBtn');
    if (btn) btn.classList.remove('active');
    const bottomArea = document.getElementById('boBottomArea') || document.querySelector('.bo-bottom-area');
    if (bottomArea) bottomArea.classList.remove('delete-expanded');
    this._boRenderAll();
    StorageManager.scheduleSave();
  },

  _boFocusParticipant(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    // 找到对应的画布便签并移动视口
    const noteEl = document.querySelector('.bo-canvas-note[data-pid="' + pid + '"]');
    if (noteEl) {
      const area = document.getElementById('boCanvasArea');
      const cs = this._boCanvasState;
      const noteX = parseFloat(noteEl.style.left);
      const noteY = parseFloat(noteEl.style.top);
      const areaW = area.clientWidth;
      const areaH = area.clientHeight;
      cs.x = noteX - areaW / (2 * cs.scale) + 120;
      cs.y = noteY - areaH / (2 * cs.scale) + 80;
      this._boUpdateCanvasTransform();
    }
  },

  _boEditInit(pid, el) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    const current = p.initiative !== null ? p.initiative : '';
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.style.cssText = 'width:100%;height:100%;border:none;background:transparent;color:#d4a853;font-size:14px;font-weight:700;text-align:center;outline:none;';
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      const val = input.value.trim();
      p.initiative = val !== '' ? parseInt(val) : null;
      // 自动排序
      if (battle.participants.every(pp => pp.initiative !== null)) {
        const tt = battle.turnTracker;
        const currentPid = tt.orderedIds[tt.currentIndex] || null;
        this._boSortByInitiative(battle);
        // 排序后恢复 currentIndex 指向正确的角色（无论战斗是否已开始）
        if (currentPid) {
          const newIdx = tt.orderedIds.indexOf(currentPid);
          if (newIdx >= 0) tt.currentIndex = newIdx;
        }
      }
      // 教学：检测是否已有2人填写了先攻值
      if (typeof Tutorial !== 'undefined') {
        const filled = battle.participants.filter(pp => pp.initiative !== null).length;
        if (filled >= 2) {
          Tutorial.emit('initiativeChanged', { count: filled });
        }
      }
      this._boRenderAll();
      StorageManager.scheduleSave();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { p.initiative = current !== '' ? parseInt(current) : null; this._boRenderTurnList(); }
      if (e.key === 'Tab') { e.preventDefault(); commit(); }
    });
  },

  _boSortByInitiative(battle) {
    battle.turnTracker.orderedIds.sort((a, b) => {
      const pa = this._getParticipant(battle, a);
      const pb = this._getParticipant(battle, b);
      const ia = pa ? pa.initiative : -999;
      const ib = pb ? pb.initiative : -999;
      return ib - ia;
    });
  },

  /* ---------- 回合管理 ---------- */
  _boSpawnEndTurnParticles() {
    const container = document.getElementById('boEndTurnParticles');
    if (!container) return;
    const count = 16;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'bo-end-turn-particle';
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
      const dist = 40 + Math.random() * 50;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      p.style.setProperty('--px', px + 'px');
      p.style.setProperty('--py', py + 'px');
      p.style.width = (2 + Math.random() * 4) + 'px';
      p.style.height = p.style.width;
      p.style.animation = 'boParticle ' + (0.4 + Math.random() * 0.4) + 's ease-out forwards';
      p.style.animationDelay = (Math.random() * 0.1) + 's';
      const hue = 40 + Math.random() * 15;
      p.style.background = 'hsl(' + hue + ', 70%, ' + (55 + Math.random() * 20) + '%)';
      container.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  },

  endCurrentTurn() {
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('endTurnClicked', {});
    }
    // 粒子动效
    this._boSpawnEndTurnParticles();
    const btn = document.getElementById('boEndTurnBtn');
    if (btn) { btn.classList.remove('clicked'); void btn.offsetWidth; btn.classList.add('clicked'); }

    const battle = this._getCurrentBattle();
    if (!battle) return;
    const tt = battle.turnTracker;
    const ordered = tt.orderedIds;
    if (!ordered || ordered.length === 0) return;
    const len = ordered.length;

    // 强制校正 currentIndex 为有效整数
    let idx = Math.floor(tt.currentIndex);
    if (isNaN(idx) || idx < 0 || idx >= len) {
      idx = 0;
    }
    tt.currentIndex = idx;

    // 如果战斗未开始，激活它
    if (!tt.isActive) {
      tt.isActive = true;
      tt.currentRound = 1;
      tt.currentIndex = 0;
      this._boAdvanceWorldClock(0);
      this._boAddLog(battle, 'system', null, null, 0, null, '战斗开始！');
      this._boRenderAll();
      StorageManager.scheduleSave();
      return;
    }

    // 推进到下一个角色
    const nextIdx = idx + 1;
    if (nextIdx >= len) {
      // 末尾角色结束 → 回到首位，轮次+1
      tt.currentIndex = 0;
      tt.currentRound++;
      // 自动状态衰减
      this._boAutoDecayStatuses(battle);
      // 世界时钟联动：每轮6秒
      this._boAdvanceWorldClock(6);
      // 统计
      battle.statistics.totalRounds = tt.currentRound;
    } else {
      tt.currentIndex = nextIdx;
    }

    // 最终一致性断言
    if (tt.currentIndex < 0 || tt.currentIndex >= len) {
      tt.currentIndex = 0;
    }

    this._boRenderAll();
    this._boCheckTriggers();
    
    this._boClearActionAlerts();
    const currentPid = ordered[tt.currentIndex];
    if (currentPid) {
      this._boShowActionPanel(currentPid);
    }
    
    StorageManager.scheduleSave();

    if (tt.isActive && tt.currentRound > 1) {
      Tutorial.emit('roundEnded', { round: tt.currentRound });
    }
  },

  _boAutoDecayStatuses(battle) {
    battle.participants.forEach(p => {
      const ct = this._getCombatTracker(p);
      if (!ct) return;
      const toRemove = [];
      ct.statuses.forEach((s, idx) => {
        if (s.unit === 'rounds' && s.duration !== null) {
          s.duration--;
          if (s.duration <= 0) {
            toRemove.push(idx);
            this._boAddLog(battle, 'status', null, p.id, 0, s.name, p.instanceName + ' 的 ' + s.name + ' 状态已到期');
          }
        }
      });
      for (let i = toRemove.length - 1; i >= 0; i--) {
        ct.statuses.splice(toRemove[i], 1);
      }
    });
  },

  _boAdvanceWorldClock(seconds) {
    const wt = AppState.currentModule.board.worldTime;
    if (!wt) return;
    this._boWorldClockAccumulator += seconds;
    const mins = Math.floor(this._boWorldClockAccumulator / 60);
    this._boWorldClockAccumulator -= mins * 60;
    wt.time += mins;
    if (wt.time >= 1440) { wt.time -= 1440; wt.day++; }
    if (typeof WorldClock !== 'undefined' && WorldClock._renderDigits) {
      WorldClock._renderDigits(true);
    }
  },

  /* ---------- 快捷操作（v2.0） ---------- */
  _boSelectAction(action) {
    if (action === 'status') {
      this._boAction = action;
      // 取消删除模式避免冲突
      if (this._boDeleteMode) this._boToggleDeleteMode();
      this._boShowStatusPicker();
      if (typeof Tutorial !== 'undefined') {
        Tutorial.emit('actionSelected', { action: 'status' });
      }
      return;
    }
    // 校验输入框数值（status 除外）
    const input = document.getElementById('boActionInput');
    const rawVal = input.value.trim();
    const val = parseInt(rawVal) || 0;
    if (rawVal === '' || val <= 0) {
      this._boShowInputWarn();
      return;
    }
    // 如果已选同一行动，取消选择
    if (this._boAction === action && this._boTargetMode) {
      this._boCancelTargetMode();
      return;
    }
    this._boAction = action;
    this._boTargetMode = true;
    this._boSelectedTargets = [];
    this._boStatusTargetMode = false;
    // 取消删除模式避免冲突
    if (this._boDeleteMode) this._boToggleDeleteMode();
    // 更新按钮高亮
    document.querySelectorAll('.bo-action-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.getAttribute('data-action') === action);
    });
    // 显示提示气泡
    this._boShowTooltip();
    // 画布十字光标
    const area = document.getElementById('boCanvasArea');
    if (area) area.classList.add('target-selected');
    this._boUpdateConfirmBtn();
    this._boRenderTurnList();
    this._boRenderCanvasNotes();
    this._boRenderTriggerNotes();
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('actionSelected', { action });
    }
  },

  _boCancelTargetMode() {
    this._boTargetMode = false;
    this._boSelectedTargets = [];
    this._boAction = null;
    this._boStatusTargetMode = false;
    this._boStatusPickerTarget = null;
    document.querySelectorAll('.bo-action-btn').forEach(btn => btn.classList.remove('selected'));
    // 隐藏提示气泡
    this._boHideTooltip();
    // 隐藏箭头
    this._boHideArrow();
    // 移除十字光标
    const area = document.getElementById('boCanvasArea');
    if (area) area.classList.remove('target-selected');
    this._boUpdateConfirmBtn();
    this._boRenderTurnList();
    this._boRenderCanvasNotes();
    this._boRenderTriggerNotes();
  },

  _boShowTooltip() {
    const tt = document.getElementById('boTargetTooltip');
    if (tt) tt.style.display = 'flex';
  },
  _boHideTooltip() {
    const tt = document.getElementById('boTargetTooltip');
    if (tt) tt.style.display = 'none';
  },

  _boUpdateConfirmBtn() {
    const btn = document.getElementById('boTooltipConfirm');
    const textEl = document.getElementById('boTooltipText');
    if (!btn) return;
    const hasTargets = this._boSelectedTargets.length > 0;
    const hasAction = !!this._boAction;
    btn.classList.toggle('confirming', hasAction && hasTargets);
    if (textEl) {
      if (hasAction && hasTargets) {
        const actionLabels = { damage: '攻击', heal: '治疗', tempHp: '临时HP', status: '状态' };
        textEl.textContent = (actionLabels[this._boAction] || '确认') + ' ×' + this._boSelectedTargets.length;
      } else {
        textEl.textContent = '左键点选目标 · 右键/ESC 取消';
      }
    }
  },

  _boConfirmAction() {
    if (!this._boAction || this._boSelectedTargets.length === 0) return;
    this._boExecuteAction();
  },

  _boUpdateArrowOverlay() {
    const svg = document.getElementById('boArrowOverlay');
    if (!svg) return;
    const battle = this._getCurrentBattle();
    if (!battle || !this._boTargetMode || this._boSelectedTargets.length === 0) {
      this._boHideArrow();
      return;
    }
    // 找到当前行动者的画布便签位置
    const tt = battle.turnTracker;
    const actorPid = tt.orderedIds[tt.currentIndex];
    const actorEl = document.querySelector('.bo-canvas-note[data-pid="' + actorPid + '"]');
    if (!actorEl) { this._boHideArrow(); return; }

    const area = document.getElementById('boCanvasArea');
    const areaRect = area.getBoundingClientRect();

    // 行动者中心点（屏幕坐标）
    const actorRect = actorEl.getBoundingClientRect();
    const ax = actorRect.left + actorRect.width / 2 - areaRect.left;
    const ay = actorRect.top + actorRect.height / 2 - areaRect.top;

    // 行动类型对应颜色
    const colorMap = {
      damage: { stroke: '#c07070', glow: 'rgba(192,112,112,0.4)' },
      heal:   { stroke: '#7aba7a', glow: 'rgba(122,186,122,0.4)' },
      tempHp: { stroke: '#7a9aba', glow: 'rgba(122,154,186,0.4)' },
      status: { stroke: '#a08ad0', glow: 'rgba(160,138,208,0.4)' }
    };
    const colors = colorMap[this._boAction] || colorMap.damage;

    // 清除旧路径（保留 defs）
    svg.querySelectorAll('.bo-dynamic-arrow').forEach(el => el.remove());
    const defs = svg.querySelector('defs');

    // 为每个目标创建独立路径
    let idx = 0;
    this._boSelectedTargets.forEach(tid => {
      const tEl = document.querySelector('.bo-canvas-note[data-pid="' + tid + '"]') ||
                  document.querySelector('.bo-turn-item[data-pid="' + tid + '"]');
      if (!tEl) return;
      const tRect = tEl.getBoundingClientRect();
      const tx = tRect.left + tRect.width / 2 - areaRect.left;
      const ty = tRect.top + tRect.height / 2 - areaRect.top;
      // 贝塞尔曲线（向上弯曲的弧线）
      const mx = (ax + tx) / 2;
      const my = Math.min(ay, ty) - 60;
      const d = 'M' + ax + ',' + ay + ' Q' + mx + ',' + my + ' ' + tx + ',' + ty;

      // 动态箭头标记
      const markerId = 'boArrowHead_' + idx;
      let marker = defs.querySelector('#' + markerId);
      if (!marker) {
        marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', markerId);
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', '0 0, 10 3.5, 0 7');
        marker.appendChild(poly);
        defs.appendChild(marker);
      }
      marker.querySelector('polygon').setAttribute('fill', colors.stroke);

      // 创建路径
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.classList.add('bo-dynamic-arrow');
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('stroke', colors.stroke);
      pathEl.setAttribute('stroke-width', '2.5');
      pathEl.setAttribute('stroke-linecap', 'round');
      pathEl.setAttribute('stroke-dasharray', '12 12');
      pathEl.setAttribute('marker-end', 'url(#' + markerId + ')');
      pathEl.style.setProperty('--arrow-glow', colors.glow);
      pathEl.style.animation = 'bdcArrowFlow 0.6s linear infinite, bdcArrowGlowPulse 2s ease-in-out infinite';
      svg.appendChild(pathEl);
      idx++;
    });

    svg.style.display = '';
  },

  _boHideArrow() {
    const svg = document.getElementById('boArrowOverlay');
    const path = document.getElementById('boArrowPath');
    if (path) { path.style.display = 'none'; path.setAttribute('d', ''); }
    if (svg) { svg.querySelectorAll('.bo-dynamic-arrow').forEach(el => el.remove()); svg.style.display = 'none'; }
  },

  _boExecuteAction() {
    const battle = this._getCurrentBattle();
    if (!battle || !this._boAction) return;
    const rawVal = document.getElementById('boActionInput').value;
    const val = parseInt(rawVal) || 0;
    if (this._boAction !== 'status' && (rawVal.trim() === '' || val <= 0)) {
      this._boShowActionWarning('请输入有效的正整数数值');
      return;
    }

    const actor = this._getCurrentActor();
    const actorName = actor ? actor.instanceName : '未知';

    // 确认闪光动画
    const confirmBtn = document.getElementById('boTooltipConfirm');
    if (confirmBtn) {
      confirmBtn.style.animation = 'bdcConfirmFlash 0.5s ease';
      setTimeout(() => confirmBtn.style.animation = '', 500);
    }

    this._boSelectedTargets.forEach(tid => {
      const target = this._getParticipant(battle, tid);
      if (!target) return;
      const ct = this._getCombatTracker(target);
      if (!ct) return;
      const targetName = target.instanceName;
      const hpBefore = ct.currentHp;
      const tempHpBefore = ct.tempHp;

      switch (this._boAction) {
        case 'damage':
          this._applyDamage(ct, val);
          this._boAddLog(battle, 'damage', actor ? actor.id : null, tid, val, null, actorName + ' → ' + targetName + ' 造成 ' + val + ' 点伤害');
          this._boRecordStat(battle, 'damage', actor ? actor.id : null, tid, val);
          if (ct.currentHp <= 0) {
            this._boAddLog(battle, 'death', null, tid, 0, null, targetName + ' 进入濒死状态！');
            battle.statistics.nearDeathEvents.push({ participantId: tid, round: battle.turnTracker.currentRound });
          }
          break;
        case 'heal':
          this._applyHeal(ct, val);
          this._boAddLog(battle, 'heal', actor ? actor.id : null, tid, val, null, actorName + ' → ' + targetName + ' 治疗 ' + val + ' 点生命');
          this._boRecordStat(battle, 'healing', actor ? actor.id : null, tid, val);
          break;
        case 'tempHp':
          if (ct.tempHp < val) {
            ct.tempHp = val;
            this._boAddLog(battle, 'tempHp', actor ? actor.id : null, tid, val, null, actorName + ' → ' + targetName + ' 临时HP设为 ' + val);
          } else {
            this._boAddLog(battle, 'system', null, null, 0, null, targetName + ' 的临时HP未变化');
          }
          break;
        case 'status':
          if (this._boStatusPickerTarget) {
            const statusName = this._boStatusPickerTarget;
            const dur = this._boStatusPickerDur || 1;
            const existSt = ct.statuses.find(s => s.name === statusName);
            if (existSt && existSt.duration !== null) {
              existSt.duration += dur;
              this._boAddLog(battle, 'status', actor ? actor.id : null, tid, dur, statusName, actorName + ' → ' + targetName + ' ' + statusName + ' 叠加 +' + dur + ' 轮（共 ' + existSt.duration + ' 轮）');
            } else if (existSt) {
              this._boAddLog(battle, 'status', actor ? actor.id : null, tid, dur, statusName, actorName + ' → ' + targetName + ' ' + statusName + ' 已为永久状态');
            } else {
              ct.statuses.push({ name: statusName, duration: dur, unit: 'rounds' });
              this._boAddLog(battle, 'status', actor ? actor.id : null, tid, dur, statusName, actorName + ' → ' + targetName + ' 施加 ' + statusName + ' ' + dur + ' 轮');
            }
            battle.statistics.statusEvents.push({ participantId: tid, statusName, round: battle.turnTracker.currentRound });
          }
          break;
      }
    });

    // 重置状态
    const executedAction = this._boAction;
    this._boAction = null;
    this._boTargetMode = false;
    this._boStatusTargetMode = false;
    this._boSelectedTargets = [];
    this._boStatusPickerTarget = null;
    document.querySelectorAll('.bo-action-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('boActionInput').value = '0';
    this._boHideTooltip();
    this._boHideArrow();
    const area = document.getElementById('boCanvasArea');
    if (area) area.classList.remove('target-selected');
    this._boUpdateConfirmBtn();
    this._boRenderAll();
    StorageManager.scheduleSave();
    if (typeof Tutorial !== 'undefined' && executedAction) {
      Tutorial.emit('actionExecuted', { action: executedAction });
    }
  },

  _boShowActionWarning(msg) {
    // 移除已有的警告气泡
    const old = document.getElementById('boActionWarning');
    if (old) old.remove();
    const bubble = document.createElement('div');
    bubble.id = 'boActionWarning';
    bubble.className = 'bo-action-warning';
    bubble.textContent = msg;
    const overlay = document.getElementById('battleOverlay');
    if (overlay) overlay.appendChild(bubble);
    // 5秒后自动消失
    setTimeout(() => {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateX(-50%) translateY(-8px)';
      setTimeout(() => bubble.remove(), 300);
    }, 5000);
  },

  _boShowInputWarn() {
    const warn = document.getElementById('boActionInputWarn');
    if (!warn) return;
    warn.style.display = 'inline-flex';
    warn.classList.add('show');
    clearTimeout(this._boInputWarnTimer);
    this._boInputWarnTimer = setTimeout(() => {
      warn.classList.remove('show');
      setTimeout(() => { warn.style.display = 'none'; }, 300);
    }, 1500);
  },

  _boAdjustActionInput(delta) {
    const input = document.getElementById('boActionInput');
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
  },

  _applyDamage(ct, val) {
    // 先扣临时HP
    if (ct.tempHp > 0) {
      if (ct.tempHp >= val) { ct.tempHp -= val; return; }
      val -= ct.tempHp;
      ct.tempHp = 0;
    }
    if (ct.currentHp !== null) {
      ct.currentHp = Math.max(0, ct.currentHp - val);
    }
  },

  _applyHeal(ct, val) {
    const maxHp = parseFloat(ct.maxHp) || 0;
    if (ct.currentHp !== null && maxHp > 0) {
      ct.currentHp = Math.min(maxHp, ct.currentHp + val);
    }
  },

  _getCurrentActor() {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.turnTracker.isActive) return null;
    const pid = battle.turnTracker.orderedIds[battle.turnTracker.currentIndex];
    return this._getParticipant(battle, pid);
  },

  _boRecordStat(battle, type, actorId, targetId, val) {
    const key = type === 'damage' ? 'damageByCharacter' : 'healingByCharacter';
    if (actorId) {
      battle.statistics[key][actorId] = (battle.statistics[key][actorId] || 0) + val;
    }
    if (type === 'damage' && targetId) {
      battle.statistics.damageTakenByCharacter[targetId] = (battle.statistics.damageTakenByCharacter[targetId] || 0) + val;
    }
  },

  /* ---------- 状态选择器 ---------- */
  _boShowStatusPicker() {
    const picker = document.getElementById('boStatusPicker');

    // 先填充内容，再显示和测量，确保高度准确
    let html = '<div class="bo-status-picker-grid">';
    this.STATUS_PRESETS.forEach(name => {
      const sk = this.STATUS_KEYS[name] || 'custom';
      html += '<div class="bo-status-pick-btn status-' + sk + '" onclick="BoardManager._boPickStatus(\'' + name + '\')">' + name + '</div>';
    });
    html += '</div>';
    html += '<div class="bo-status-dur-row">';
    html += '<button class="bo-status-dur-btn" onclick="event.stopPropagation();BoardManager._boAdjustDur(-1)">\u2212</button>';
    html += '<input class="bo-status-dur-input" id="boStatusDur" type="number" min="0" value="0" placeholder="轮数">';
    html += '<button class="bo-status-dur-btn" onclick="event.stopPropagation();BoardManager._boAdjustDur(1)">+</button>';
    html += '<span style="color:rgba(255,255,255,0.4);font-size:11px;">轮</span>';
    html += '<span class="bo-status-dur-warn" id="boStatusDurWarn" style="display:none;">!</span>';
    html += '</div>';
    picker.innerHTML = html;
    picker.style.display = 'block';

    // 等待一帧确保布局完成再定位
    requestAnimationFrame(() => {
      const btn = document.querySelector('.bo-action-btn.status');
      const rect = btn.getBoundingClientRect();
      picker.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
      const pickerH = picker.offsetHeight;
      const actionBar = document.querySelector('.bo-action-bar-float');
      if (actionBar) {
        const barRect = actionBar.getBoundingClientRect();
        picker.style.top = Math.max(8, barRect.top - pickerH) + 'px';
      } else {
        picker.style.top = Math.max(8, rect.top - pickerH - 19) + 'px';
      }

      // 点击弹窗外部关闭
      setTimeout(() => {
        const dismissHandler = (ev) => {
          if (typeof TutorialManager !== 'undefined' && TutorialManager._isActive) return;
          if (!picker.contains(ev.target)) {
            picker.style.display = 'none';
          document.removeEventListener('mousedown', dismissHandler);
          document.removeEventListener('contextmenu', dismissHandler);
        }
      };
      document.addEventListener('mousedown', dismissHandler);
      document.addEventListener('contextmenu', dismissHandler);
    }, 50);
    });
  },

  _boPickStatus(statusName) {
    const durInput = document.getElementById('boStatusDur');
    const dur = parseInt(durInput.value) || 0;
    if (dur <= 0) {
      // 显示叹号提示
      const warn = document.getElementById('boStatusDurWarn');
      if (warn) {
        warn.style.display = 'inline';
        warn.classList.add('show');
        clearTimeout(this._boDurWarnTimer);
        this._boDurWarnTimer = setTimeout(() => {
          warn.classList.remove('show');
          setTimeout(() => { warn.style.display = 'none'; }, 300);
        }, 1500);
      }
      return;
    }
    document.getElementById('boStatusPicker').style.display = 'none';
    this._boTargetMode = true;
    this._boStatusTargetMode = true;
    this._boSelectedTargets = [];
    this._boStatusPickerTarget = statusName;
    this._boStatusPickerDur = dur;
    // 进入目标选择模式
    this._boShowTooltip();
    const area = document.getElementById('boCanvasArea');
    if (area) area.classList.add('target-selected');
    this._boUpdateConfirmBtn();
    this._boRenderTurnList();
    this._boRenderCanvasNotes();
  },

  _boAdjustDur(delta) {
    const input = document.getElementById('boStatusDur');
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;
  },

  /* ---------- 战斗日志 ---------- */
  _boAddLog(battle, type, actorId, targetId, value, statusName, text) {
    const time = this._getWorldClockTime ? this._getWorldClockTime() : '';
    battle.combatLog.push({
      text, type, actorId, targetId, value, statusName, time,
      round: battle.turnTracker.currentRound
    });
    if (battle.combatLog.length > 200) battle.combatLog.shift();
  },

  _boRenderLog() {
    const battle = this._getCurrentBattle();
    if (!battle) return '';
    let html = '<div class="bo-log-header"><span class="bo-log-title">战斗日志</span>';
    if (battle.combatLog.length > 0) html += '<button class="bo-log-clear" onclick="BoardManager._boClearLog()">清空</button>';
    html += '</div>';

    if (battle.combatLog.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);font-size:11px;">暂无日志</div>';
      return html;
    }

    let lastRound = -1;
    const entries = battle.combatLog.slice(-50);
    entries.forEach(entry => {
      if (entry.round > lastRound && entry.round > 0) {
        html += '<div class="bo-log-round-sep">\u2014\u2014 第 ' + entry.round + ' 轮 \u2014\u2014</div>';
        lastRound = entry.round;
      }
      const actor = entry.actorId ? this._getParticipant(battle, entry.actorId) : null;
      const actorCls = actor ? (actor.faction || 'enemy_npc') : '';
      html += '<div class="bo-log-entry">';
      html += '<span class="bo-log-time">' + (entry.time || '') + '</span>';
      if (actor) html += '<span class="bo-log-actor ' + actorCls + '">' + this._esc(actor.instanceName) + '</span>';
      html += '<span class="bo-log-text ' + (entry.type || '') + '">' + this._esc(entry.text) + '</span>';
      html += '</div>';
    });
    return html;
  },

  _boClearLog() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    battle.combatLog = [];
    this._boRenderPanelContent();
    StorageManager.scheduleSave();
  },

  /* ---------- 概览 ---------- */
  _boRenderOverview() {
    const battle = this._getCurrentBattle();
    if (!battle) return '';
    const pcs = battle.participants.filter(p => p.faction === 'pc');
    const enemies = battle.participants.filter(p => p.faction === 'enemy_npc');
    const neutrals = battle.participants.filter(p => !p.faction || p.faction === 'friendly_npc');

    let html = '';
    const renderGroup = (title, list) => {
      if (list.length === 0) return '';
      let h = '<div class="bo-overview-group-title">' + title + ' (' + list.length + ')</div>';
      list.forEach(p => {
        const ct = this._getCombatTracker(p);
        const maxHp = ct ? ct.maxHp : null;
        const curHp = ct ? ct.currentHp : null;
        const tmpHp = ct ? (ct.tempHp || 0) : 0;
        const pct = (maxHp > 0 && curHp !== null) ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
        const hpClass = curHp === null ? '' : (curHp <= 0 ? 'hp-dead' : (pct <= 25 ? 'hp-low' : (pct <= 50 ? 'hp-mid' : 'hp-high')));
        const faction = p.faction || 'enemy_npc';
        const initial = (p.instanceName || '?').charAt(0);
        const pCd = this._getParticipantCharData(p);
        const isCoc = pCd._coc7 && pCd.attributes;
        const ac = isCoc ? null : (pCd.ac || '--');

        h += '<div class="bo-overview-card" onclick="BoardManager._boFocusParticipant(\'' + p.id + '\')">';
        h += '<div class="bo-overview-avatar ' + faction + '">' + initial + '</div>';
        h += '<div class="bo-overview-info">';
        h += '<div class="bo-overview-name">' + this._esc(p.instanceName) + '</div>';
        if (isCoc) {
          const cocSan = pCd.san || {};
          const cocMp = pCd.mp || {};
          h += '<div class="bo-overview-ac">SAN ' + (cocSan.current != null ? cocSan.current + '/' + (cocSan.max != null ? cocSan.max : '--') : '--') + ' · MP ' + (cocMp.current != null ? cocMp.current + '/' + (cocMp.max != null ? cocMp.max : '--') : '--') + '</div>';
        } else {
          h += '<div class="bo-overview-ac">AC ' + ac + '</div>';
        }
        h += '<div class="bo-overview-hp-bar"><div class="bo-overview-hp-fill ' + hpClass + '" style="width:' + pct + '%"></div></div>';
        h += '<div class="bo-overview-hp-text">' + (curHp !== null ? curHp + '/' + (maxHp || '?') + (tmpHp > 0 ? ' +' + tmpHp : '') : '--') + '</div>';
        // 状态
        if (ct && ct.statuses.length > 0) {
          h += '<div class="bo-overview-statuses">';
          ct.statuses.forEach(s => {
            const sk = BoardManager.STATUS_KEYS[s.name] || 'custom';
            const durLabel = s.duration ? '<span class="bo-status-dur">' + s.duration + '</span>' : '';
            h += '<div class="bo-turn-status-dot status-' + sk + '" title="' + this._esc(s.name) + (s.duration ? ' (' + s.duration + (s.unit === 'rounds' ? '轮' : '分') + ')' : '') + '">' + this._getStatusEmoji(s.name) + durLabel + '</div>';
          });
          h += '</div>';
        }
        // 资源
        if (p.resourceNotes) {
          h += '<div class="bo-overview-resource">' + this._esc(p.resourceNotes) + '</div>';
        }
        h += '</div></div>';
      });
      return h;
    };

    html += renderGroup('PC', pcs);
    html += renderGroup('敌方', enemies);
    html += renderGroup('中立', neutrals);
    return html;
  },

  /* ---------- 触发器 ---------- */
  _boRenderTriggers() {
    const battle = this._getCurrentBattle();
    if (!battle) return '';
    let html = '<div class="bo-log-header"><span class="bo-log-title">条件触发器</span></div>';

    battle.triggers.forEach((t, idx) => {
      const cls = t.isTriggered ? (t.isAcknowledged ? 'bo-trigger-card acknowledged' : 'bo-trigger-card triggered') : 'bo-trigger-card';
      html += '<div class="' + cls + '">';
      html += '<div class="bo-trigger-header"><span class="bo-trigger-type">' + t.type + '</span>';
      html += '<span class="bo-trigger-condition">' + this._boDescribeTrigger(t) + '</span></div>';
      html += '<div class="bo-trigger-message">' + this._esc(t.message) + '</div>';
      html += '<div class="bo-trigger-actions">';
      if (t.isTriggered && !t.isAcknowledged) {
        html += '<button class="bo-trigger-ack-btn" onclick="BoardManager._boAckTrigger(' + idx + ')">已处理</button>';
      }
      html += '<button class="bo-trigger-del-btn" onclick="BoardManager._boDelTrigger(' + idx + ')">删除</button>';
      html += '</div></div>';
    });

    html += '<button class="bo-add-trigger-btn" onclick="BoardManager._boShowTriggerModal()">+ 添加触发器</button>';
    return html;
  },

  _boDescribeTrigger(t) {
    switch (t.type) {
      case 'hp_threshold': {
        const p = this._getParticipant(this._getCurrentBattle(), t.targetId);
        return (p ? p.instanceName : '?') + ' HP \u2264 ' + t.condition.value + '%';
      }
      case 'round': return '第 ' + t.condition.round + ' 回合';
      case 'death': {
        const p = this._getParticipant(this._getCurrentBattle(), t.targetId);
        return (p ? p.instanceName : '?') + ' 死亡时';
      }
      default: return '';
    }
  },

  _boCheckTriggers() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    battle.triggers.forEach(t => {
      if (t.isAcknowledged) return;
      let triggered = false;
      switch (t.type) {
        case 'hp_threshold': {
          const ct = this._getCombatTracker(this._getParticipant(battle, t.targetId));
          if (ct && ct.currentHp !== null && ct.maxHp) {
            const pct = (ct.currentHp / ct.maxHp) * 100;
            if (pct <= t.condition.value) triggered = true;
          }
          break;
        }
        case 'round':
          if (battle.turnTracker.currentRound >= t.condition.round) triggered = true;
          break;
        case 'death': {
          const ct = this._getCombatTracker(this._getParticipant(battle, t.targetId));
          if (ct && ct.currentHp !== null && ct.currentHp <= 0) triggered = true;
          break;
        }
      }
      if (triggered && !t.isTriggered) {
        t.isTriggered = true;
        this._boShowTriggerBanner(t);
      }
    });
  },

  _boShowTriggerBanner(trigger) {
    const banner = document.getElementById('boTriggerBanner');
    banner.style.display = 'flex';
    banner.className = 'bo-trigger-banner';
    banner.innerHTML =
      '<div class="bo-trigger-banner-icon">\u26A1</div>' +
      '<div class="bo-trigger-banner-text">' + this._esc(trigger.message) + '</div>' +
      '<button class="bo-trigger-banner-dismiss" onclick="BoardManager._boDismissBanner()">知道了</button>';
  },

  _boDismissBanner() {
    document.getElementById('boTriggerBanner').style.display = 'none';
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const t = battle.triggers.find(tr => tr.isTriggered && !tr.isAcknowledged);
    if (t) t.isAcknowledged = true;
    this._boRenderPanelContent();
    StorageManager.scheduleSave();
  },

  _boAckTrigger(idx) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.triggers[idx]) return;
    battle.triggers[idx].isAcknowledged = true;
    document.getElementById('boTriggerBanner').style.display = 'none';
    this._boRenderPanelContent();
    StorageManager.scheduleSave();
  },

  _boDelTrigger(idx) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    battle.triggers.splice(idx, 1);
    this._boRenderPanelContent();
    StorageManager.scheduleSave();
  },

  _boShowTriggerModal() {
    const modal = document.getElementById('boTriggerModal');
    const battle = this._getCurrentBattle();
    if (!battle) return;

    const pOptions = battle.participants.map(p => '<option value="' + p.id + '">' + this._esc(p.instanceName) + '</option>').join('');

    modal.style.display = 'flex';
    modal.innerHTML =
      '<div class="bo-trigger-modal-box">' +
        '<div class="bo-tm-header"><span class="bo-tm-title">添加触发器</span><button class="bo-ap-close" onclick="document.getElementById(\'boTriggerModal\').style.display=\'none\'">\u00D7</button></div>' +
        '<div class="bo-tm-body">' +
          '<div class="bo-tm-field"><div class="bo-tm-label">类型</div><select class="bo-tm-select" id="tmType" onchange="BoardManager._boTriggerTypeChange()"><option value="hp_threshold">HP 阈值</option><option value="round">回合数</option><option value="death">角色死亡</option></select></div>' +
          '<div class="bo-tm-field" id="tmTargetField"><div class="bo-tm-label">目标角色</div><select class="bo-tm-select" id="tmTarget">' + pOptions + '</select></div>' +
          '<div class="bo-tm-field" id="tmValueField"><div class="bo-tm-label">阈值 (%)</div><input class="bo-tm-input" id="tmValue" type="number" value="50" min="1" max="100"></div>' +
          '<div class="bo-tm-field"><div class="bo-tm-label">提醒文本</div><input class="bo-tm-input" id="tmMessage" placeholder="触发时显示的提醒信息..."></div>' +
        '</div>' +
        '<div class="bo-tm-footer">' +
          '<button class="bo-tm-btn cancel" onclick="document.getElementById(\'boTriggerModal\').style.display=\'none\'">取消</button>' +
          '<button class="bo-tm-btn confirm" onclick="BoardManager._boAddTrigger()">添加</button>' +
        '</div>' +
      '</div>';
  },

  _boTriggerTypeChange() {
    const type = document.getElementById('tmType').value;
    const targetField = document.getElementById('tmTargetField');
    const valueField = document.getElementById('tmValueField');
    if (type === 'round') {
      targetField.style.display = 'none';
      valueField.querySelector('.bo-tm-label').textContent = '回合数';
      document.getElementById('tmValue').value = '3';
    } else {
      targetField.style.display = 'block';
      if (type === 'hp_threshold') {
        valueField.querySelector('.bo-tm-label').textContent = '阈值 (%)';
        document.getElementById('tmValue').value = '50';
      } else {
        valueField.style.display = 'none';
      }
    }
    if (type !== 'death') valueField.style.display = 'block';
  },

  _boAddTrigger() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const type = document.getElementById('tmType').value;
    const message = document.getElementById('tmMessage').value.trim();
    if (!message) return;

    const trigger = {
      id: AppState.generateUUID(),
      type,
      targetId: type !== 'round' ? document.getElementById('tmTarget').value : null,
      condition: {},
      message,
      isOneShot: true,
      isTriggered: false,
      isAcknowledged: false
    };

    if (type === 'hp_threshold') trigger.condition.value = parseInt(document.getElementById('tmValue').value) || 50;
    if (type === 'round') trigger.condition.round = parseInt(document.getElementById('tmValue').value) || 3;

    // 添加画布便签位置（当前视口中心附近随机偏移）
    const cs = this._boCanvasState;
    const area = document.getElementById('boCanvasArea');
    const areaW = area ? area.clientWidth : 800;
    const areaH = area ? area.clientHeight : 600;
    trigger.canvasNote = {
      x: cs.x + (areaW / cs.scale) / 2 - 100 + (Math.random() - 0.5) * 80,
      y: cs.y + (areaH / cs.scale) / 2 - 60 + (Math.random() - 0.5) * 60
    };

    battle.triggers.push(trigger);
    document.getElementById('boTriggerModal').style.display = 'none';
    this._boRenderPanelContent();
    this._boRenderTriggerNotes();
    this._boRenderMinimap();
    StorageManager.scheduleSave();
  },

  /* ---------- 统计 ---------- */
  _boRenderStats() {
    const battle = this._getCurrentBattle();
    if (!battle) return '';
    const stats = battle.statistics;

    let html = '';
    // 基本信息
    html += '<div class="bo-stat-section"><div class="bo-stat-title">战斗概况</div>';
    html += '<div class="bo-stat-row"><span class="bo-stat-name">总回合数</span><span class="bo-stat-value">' + stats.totalRounds + '</span></div>';
    if (typeof SystemManager !== 'undefined' && SystemManager.getCurrentSystem() === 'dnd5r') {
      html += '<div class="bo-stat-row"><span class="bo-stat-name">游戏内时间</span><span class="bo-stat-value">' + (stats.totalRounds * 6) + ' 秒</span></div>';
    }
    html += '</div>';

    // 伤害输出排行
    const dmgEntries = Object.entries(stats.damageByCharacter).sort((a, b) => b[1] - a[1]);
    if (dmgEntries.length > 0) {
      const maxDmg = dmgEntries[0][1];
      html += '<div class="bo-stat-section"><div class="bo-stat-title">伤害输出</div>';
      dmgEntries.forEach(([pid, val]) => {
        const p = this._getParticipant(battle, pid);
        const name = p ? p.instanceName : '未知';
        const pct = maxDmg > 0 ? (val / maxDmg * 100) : 0;
        html += '<div class="bo-stat-row"><span class="bo-stat-name">' + this._esc(name) + '</span><div class="bo-stat-bar"><div class="bo-stat-bar-fill" style="width:' + pct + '%;background:#c07070;"></div></div><span class="bo-stat-value dmg">' + val + '</span></div>';
      });
      html += '</div>';
    }

    // 治疗排行
    const healEntries = Object.entries(stats.healingByCharacter).sort((a, b) => b[1] - a[1]);
    if (healEntries.length > 0) {
      const maxHeal = healEntries[0][1];
      html += '<div class="bo-stat-section"><div class="bo-stat-title">治疗量</div>';
      healEntries.forEach(([pid, val]) => {
        const p = this._getParticipant(battle, pid);
        const name = p ? p.instanceName : '未知';
        const pct = maxHeal > 0 ? (val / maxHeal * 100) : 0;
        html += '<div class="bo-stat-row"><span class="bo-stat-name">' + this._esc(name) + '</span><div class="bo-stat-bar"><div class="bo-stat-bar-fill" style="width:' + pct + '%;background:#7aba7a;"></div></div><span class="bo-stat-value heal-val">' + val + '</span></div>';
      });
      html += '</div>';
    }

    // 受伤排行
    const takenEntries = Object.entries(stats.damageTakenByCharacter).sort((a, b) => b[1] - a[1]);
    if (takenEntries.length > 0) {
      html += '<div class="bo-stat-section"><div class="bo-stat-title">承伤排行</div>';
      const maxTaken = takenEntries[0][1];
      takenEntries.forEach(([pid, val]) => {
        const p = this._getParticipant(battle, pid);
        const name = p ? p.instanceName : '未知';
        const pct = maxTaken > 0 ? (val / maxTaken * 100) : 0;
        html += '<div class="bo-stat-row"><span class="bo-stat-name">' + this._esc(name) + '</span><div class="bo-stat-bar"><div class="bo-stat-bar-fill" style="width:' + pct + '%;background:#a08ad0;"></div></div><span class="bo-stat-value">' + val + '</span></div>';
      });
      html += '</div>';
    }

    // 濒死记录
    if (stats.nearDeathEvents.length > 0) {
      html += '<div class="bo-stat-section"><div class="bo-stat-title">濒死记录</div>';
      stats.nearDeathEvents.forEach(ev => {
        const p = this._getParticipant(battle, ev.participantId);
        const name = p ? p.instanceName : '未知';
        html += '<div class="bo-stat-row"><span class="bo-stat-name">' + this._esc(name) + '</span><span class="bo-stat-value" style="color:#c04040;">第 ' + ev.round + ' 轮</span></div>';
      });
      html += '</div>';
    }

    const hasCombatData = dmgEntries.length > 0 || healEntries.length > 0 || takenEntries.length > 0 || stats.nearDeathEvents.length > 0;
    if (!hasCombatData) {
      html += '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.2);font-size:11px;">暂无战斗记录，使用快捷操作后数据将显示在此</div>';
    }
    return html;
  },

  /* ---------- 通知面板 ---------- */
  _boSwitchRightTab(tab) {
    this._boRightTab = tab;
    document.querySelectorAll('.bo-notify-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tab));
    this._boRenderPanelContent();
  },

  _boSwitchTab(tab) {
    this._boSwitchRightTab(tab);
  },

  _boToggleNotifyPanel() {
    const panel = document.getElementById('boNotifyPanel');
    if (panel) panel.classList.toggle('minimized');
  },

  _boInitNotifyResize() {
    const handle = document.getElementById('boNotifyResizeHandle');
    if (!handle) return;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = document.getElementById('boNotifyPanel');
      if (!panel) return;
      panel.style.transition = 'none';
      const startY = e.clientY;
      const startH = panel.offsetHeight;
      const onMove = (ev) => {
        // 面板底部锚定，向上拖 = 增高
        const delta = startY - ev.clientY;
        const newH = Math.max(60, Math.min(600, startH + delta));
        panel.style.maxHeight = newH + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        panel.style.transition = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _boInitActionCardsDrag() {
    const cardsEl = document.getElementById('boActionCards');
    if (!cardsEl) return;
    
    let isDown = false, startX, scrollLeft;
    
    cardsEl.addEventListener('mousedown', (e) => {
      // 只拦截左键，且不是点在卡片上（卡片有自己的交互）
      if (e.button !== 0) return;
      isDown = true;
      cardsEl.style.cursor = 'grabbing';
      startX = e.pageX - cardsEl.offsetLeft;
      scrollLeft = cardsEl.scrollLeft;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - cardsEl.offsetLeft;
      const walk = (x - startX) * 1.5;
      cardsEl.scrollLeft = scrollLeft - walk;
    });
    
    document.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      cardsEl.style.cursor = '';
    });
    
    cardsEl.style.cursor = 'grab';
  },

  _boRemoveParticipant(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const idx = battle.participants.findIndex(p => p.id === pid);
    if (idx < 0) return;
    const p = battle.participants[idx];
    battle.participants.splice(idx, 1);
    // 从先攻序中移除
    const tt = battle.turnTracker;
    const oi = tt.orderedIds.indexOf(pid);
    if (oi >= 0) tt.orderedIds.splice(oi, 1);
    // 调整当前索引
    if (tt.isActive && tt.currentIndex >= tt.orderedIds.length) {
      tt.currentIndex = Math.max(0, tt.orderedIds.length - 1);
    }
    // 从目标列表中移除
    if (this._boSelectedTargets) {
      const ti = this._boSelectedTargets.indexOf(pid);
      if (ti >= 0) this._boSelectedTargets.splice(ti, 1);
    }
    this._boRenderAll();
    this._boUpdateArrowOverlay();
    StorageManager.scheduleSave();
  },

  _boRenderPanelContent() {
    const el = document.getElementById('boPanelContent');
    if (!el) return;
    switch (this._boRightTab) {
      case 'log': el.innerHTML = this._boRenderLog(); break;
      case 'overview': el.innerHTML = this._boRenderOverview(); break;
      case 'triggers': el.innerHTML = this._boRenderTriggers(); break;
      case 'stats': el.innerHTML = this._boRenderStats(); break;
    }
    // 日志自动滚到底部
    if (this._boRightTab === 'log') el.scrollTop = el.scrollHeight;
  },

  /* ---------- 参战人员管理 ---------- */
  showAddParticipantPanel(event) {
    const panel = document.getElementById('boAddParticipantPanel');
    panel.style.display = 'flex';
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('addPanelOpened', {});
    }
    // 居中显示在屏幕中央
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';

    const battle = this._getCurrentBattle();
    if (!battle) return;

    // 收集所有角色便签
    const mod = AppState.currentModule;
    const allChars = [];
    mod.board.flowUnits.forEach(unit => {
      unit.notes.forEach(note => {
        if (note.type === 'characters' && note.characterData) {
          allChars.push(note);
        }
      });
    });

    const existingSourceIds = new Set(battle.participants.map(p => p.sourceNoteId));

    let html = '<div class="bo-ap-header"><span class="bo-ap-title">添加参战人员</span><button class="bo-ap-close" onclick="document.getElementById(\'boAddParticipantPanel\').style.display=\'none\'">\u00D7</button></div>';
    html += '<input class="bo-ap-search" id="boApSearch" placeholder="搜索角色..." oninput="BoardManager._boFilterParticipants()">';
    html += '<div class="bo-ap-list" id="boApList">';

    allChars.forEach(note => {
      const cd = note.characterData;
      const name = cd.name || note.title || '未命名';
      let hpText;
      if (cd.hp && typeof cd.hp === 'object') {
        hpText = (cd.hp.current != null ? cd.hp.current : '--') + '/' + (cd.hp.max != null ? cd.hp.max : '--');
      } else {
        hpText = cd.hp || '--';
      }
      const isAdded = existingSourceIds.has(note.id);
      html += '<div class="bo-ap-item' + (isAdded ? ' added' : '') + '" data-name="' + this._esc(name).toLowerCase() + '">';
      html += '<span class="bo-ap-name">' + this._esc(name) + '</span>';
      html += '<span class="bo-ap-hp">HP ' + hpText + '</span>';
      if (!isAdded) {
        html += '<div class="bo-ap-count-row">';
        html += '<button class="bo-ap-count-btn" onclick="event.stopPropagation(); BoardManager._boAdjustCount(this, -1)">-</button>';
        html += '<span class="bo-ap-count-val">1</span>';
        html += '<button class="bo-ap-count-btn" onclick="event.stopPropagation(); BoardManager._boAdjustCount(this, 1)">+</button>';
        html += '</div>';
        html += '<button class="bo-ap-add-btn" onclick="event.stopPropagation(); BoardManager._boAddParticipant(\'' + note.id + '\', this)">添加</button>';
      } else {
        html += '<span style="font-size:10px;color:rgba(255,255,255,0.3);">已添加</span>';
      }
      html += '</div>';
    });

    html += '</div>';
    panel.innerHTML = html;
  },

  _boFilterParticipants() {
    const query = document.getElementById('boApSearch').value.toLowerCase();
    document.querySelectorAll('.bo-ap-item').forEach(item => {
      const name = item.getAttribute('data-name') || '';
      item.style.display = name.includes(query) ? 'flex' : 'none';
    });
  },

  _boAdjustCount(btn, delta) {
    const row = btn.closest('.bo-ap-count-row');
    const valEl = row.querySelector('.bo-ap-count-val');
    let val = parseInt(valEl.textContent) + delta;
    if (val < 1) val = 1;
    if (val > 20) val = 20;
    valEl.textContent = val;
  },

  _boAddParticipant(sourceNoteId, addBtn) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const note = this._findNoteGlobal(sourceNoteId);
    if (!note) return;

    // 获取数量
    const row = addBtn.closest('.bo-ap-item').querySelector('.bo-ap-count-row');
    const count = row ? parseInt(row.querySelector('.bo-ap-count-val').textContent) : 1;

    const cd = note.characterData || {};
    const baseName = cd.name || note.title || '未命名';

    // 确保源便签的 combatTracker 已初始化并正确设置HP
    if (!note.combatTracker) {
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
    }
    const srcCt = note.combatTracker;
    // 解析最大HP（兼容COC对象格式）
    const parsedMax = this._parseMaxHp(cd);
    if (parsedMax && !srcCt.maxHp) {
      srcCt.maxHp = parsedMax;
    }
    // 同步当前HP：优先使用combatTracker已有值，否则从角色数据读取
    if (srcCt.currentHp === null || srcCt.currentHp === undefined) {
      // COC格式：hp = {current, max}
      if (cd.hp && typeof cd.hp === 'object' && cd.hp.current != null) {
        srcCt.currentHp = cd.hp.current;
      } else if (parsedMax) {
        // D&D或其他格式：默认满血
        srcCt.currentHp = parsedMax;
      }
    }

    // 找到源便签所在的 flowUnit
    const mod = AppState.currentModule;
    let sourceUnitIndex = -1;
    for (let ui = 0; ui < mod.board.flowUnits.length; ui++) {
      const unit = mod.board.flowUnits[ui];
      if (unit.notes && unit.notes.some(n => n.id === sourceNoteId)) {
        sourceUnitIndex = ui;
        break;
      }
    }

    for (let i = 0; i < count; i++) {
      let participantSourceNoteId = sourceNoteId;
      const instanceName = count > 1 ? baseName + ' #' + (i + 1) : baseName;

      if (i > 0) {
        // 额外实例：创建独立的新角色便签
        const newNote = {
          id: AppState.generateUUID(),
          type: 'characters',
          title: instanceName,
          characterData: JSON.parse(JSON.stringify(cd)),
          combatTracker: {
            currentHp: srcCt.currentHp,
            maxHp: srcCt.maxHp,
            tempHp: 0,
            statuses: [],
            deathSaves: { success: 0, failure: 0 },
            log: [],
            _collapsed: false
          },
          x: note.x + 30,
          y: note.y + 30 * i,
          used: false
        };
        newNote.characterData.name = instanceName;
        newNote.characterData.faction = 'enemy_npc';

        // 添加到源便签所在的 flowUnit
        if (sourceUnitIndex >= 0) {
          mod.board.flowUnits[sourceUnitIndex].notes.push(newNote);
        }
        participantSourceNoteId = newNote.id;
      }

      // 创建战斗参与者（不持有 characterData，始终从源便签实时读取）
      // 首个实例（i===0）不持有独立 combatTracker，直接引用源便签的 combatTracker，确保HP同步
      const participantCt = (i > 0) ? {
        currentHp: srcCt.currentHp,
        maxHp: srcCt.maxHp,
        tempHp: 0,
        statuses: [],
        deathSaves: { success: 0, failure: 0 },
        log: [],
        _collapsed: false
      } : null;
      const participant = {
        id: AppState.generateUUID(),
        sourceNoteId: participantSourceNoteId,
        combatTracker: participantCt || undefined,
        instanceName,
        instanceIndex: i,
        faction: 'enemy_npc',
        initiative: null,
        isDelayed: false,
        isReady: false,
        environment: { terrain: 'normal', cover: 'none', lighting: 'bright' },
        resourceNotes: '',
        x: 100 + Math.random() * 400,
        y: 100 + Math.random() * 300
      };
      battle.participants.push(participant);
      battle.turnTracker.orderedIds.push(participant.id);
    }

    // 刷新面板
    document.getElementById('boAddParticipantPanel').style.display = 'none';
    this.showAddParticipantPanel({ currentTarget: document.getElementById('boSidebarAddBtn') });
    this._boRenderAll();
    StorageManager.scheduleSave();
    
    if (typeof Tutorial !== 'undefined') {
      Tutorial.emit('combatantsAdded', { count: battle.participants.length });
    }
  },

  /* ---------- 环境循环切换 ---------- */
  _boCycleEnv(pid, envType) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const p = this._getParticipant(battle, pid);
    if (!p || !p.environment) return;

    const cycles = {
      terrain: ['normal', 'difficult', 'hazardous'],
      cover: ['none', 'half', 'three_quarter', 'full'],
      lighting: ['bright', 'dim', 'dark']
    };
    const cycle = cycles[envType];
    if (!cycle) return;
    const idx = cycle.indexOf(p.environment[envType]);
    p.environment[envType] = cycle[(idx + 1) % cycle.length];
    this._boRenderTurnList();
    StorageManager.scheduleSave();
  },

  /* ---------- 战斗连线系统 ---------- */

  /* 切换连线模式 */
  _boToggleConnectMode() {
    const area = document.getElementById('boCanvasArea');
    if (this._boIsErasingConnections) {
      this._boExitEraseMode();
    }
    if (this._boWaitForConnectSource || this._boIsConnecting) {
      this._boExitConnectMode();
      return;
    }
    DocEditor.showToast('请点击角色卡片作为连线起点', 'info');
    document.getElementById('boToolConnectBtn')?.classList.add('active');
    area?.classList.add('connect-mode');
    this._boWaitForConnectSource = true;
    const indicator = document.getElementById('boModeIndicator');
    if (indicator) {
      indicator.innerHTML = '<div class="bmi-title-row"><span>连线模式</span><button class="bmi-exit-btn" onclick="BoardManager._boExitConnectMode()" title="退出连线模式">&times;</button></div><span class="bmi-hint">点击两个卡片连线 · 右键退出模式</span>';
      indicator.className = 'bo-mode-indicator';
      void indicator.offsetWidth;
      indicator.className = 'bo-mode-indicator visible connect';
    }
  },

  /* 开始连线：从某个参战者卡片发起 */
  _boStartConnection(pid) {
    if (this._boIsConnecting) {
      this._boCompleteConnection(pid);
      return;
    }
    this._boIsConnecting = true;
    this._boConnectSourcePid = pid;
    // 高亮源卡片（参战者卡用 data-pid，纯文本/文字用 data-note-id）
    let srcEl = document.querySelector(`#boCanvas [data-pid="${pid}"]`);
    if (!srcEl) srcEl = document.querySelector(`#boCanvas [data-note-id="${pid}"]`);
    if (srcEl) {
      srcEl.classList.add('bo-connect-source');
      srcEl.style.outline = '3px solid var(--accent)';
      srcEl.style.outlineOffset = '3px';
    }
    // 给其他卡片（含纯文字元素）添加可连线提示
    const canvas = document.getElementById('boCanvas');
    if (canvas) {
      canvas.querySelectorAll('.bo-canvas-note, .bo-canvas-text-el').forEach(card => {
        const cardId = card.dataset.pid || card.dataset.noteId;
        if (cardId !== pid) {
          card.classList.add('bo-connecting-target');
        }
      });
    }
    // 显示颜色选择器
    this._boShowConnectionColorPicker(pid);
  },

  /* 显示连线颜色选择器 */
  _boShowConnectionColorPicker(pid) {
    const old = document.getElementById('boConnectionColorPicker');
    if (old) old.remove();
    let srcEl = document.querySelector(`#boCanvas [data-pid="${pid}"]`);
    if (!srcEl) srcEl = document.querySelector(`#boCanvas [data-note-id="${pid}"]`);
    if (!srcEl) return;
    const rect = srcEl.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.id = 'boConnectionColorPicker';
    picker.style.cssText = 'position:fixed;z-index:600;display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;background:rgba(30,30,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:8px;max-width:180px;';
    picker.style.left = (rect.right + 8) + 'px';
    picker.style.top = rect.top + 'px';
    let html = '';
    this.CONNECTION_COLORS.forEach(color => {
      html += '<div style="width:20px;height:20px;border-radius:50%;background:' + color + ';cursor:pointer;border:2px solid transparent;transition:border-color 0.15s;" onmouseover="this.style.borderColor=\'#fff\'" onmouseout="this.style.borderColor=\'transparent\'" onclick="BoardManager._boSelectConnectionColor(\'' + color + '\')" title="' + color + '"></div>';
    });
    picker.innerHTML = html;
    document.getElementById('battleOverlay').appendChild(picker);
    this._boPendingConnectionColor = '#c0ab84';
  },

  /* 选择连线颜色 */
  _boSelectConnectionColor(color) {
    this._boPendingConnectionColor = color;
    const picker = document.getElementById('boConnectionColorPicker');
    if (picker) picker.remove();
  },

  /* 完成连线 */
  _boCompleteConnection(targetPid) {
    if (!this._boIsConnecting || !this._boConnectSourcePid) return;
    if (this._boConnectSourcePid === targetPid) {
      this._boResetToWaitingSource();
      return;
    }
    const battle = this._getCurrentBattle();
    if (!battle) return;
    if (!battle.canvas.connections) battle.canvas.connections = [];
    // 检查重复
    const exists = battle.canvas.connections.some(c =>
      (c.from === this._boConnectSourcePid && c.to === targetPid) ||
      (c.from === targetPid && c.to === this._boConnectSourcePid)
    );
    if (exists) {
      this._boResetToWaitingSource();
      return;
    }
    battle.canvas.connections.push({
      from: this._boConnectSourcePid,
      to: targetPid,
      color: this._boPendingConnectionColor || '#c0ab84'
    });
    this._boResetToWaitingSource();
    this._boRenderConnections();
    StorageManager.scheduleSave();
  },

  /* 连线成功后回到等待选择起点状态 */
  _boResetToWaitingSource() {
    if (this._boConnectSourcePid) {
      let srcEl = document.querySelector(`#boCanvas [data-pid="${this._boConnectSourcePid}"]`);
      if (!srcEl) srcEl = document.querySelector(`#boCanvas [data-note-id="${this._boConnectSourcePid}"]`);
      if (srcEl) {
        srcEl.classList.remove('bo-connect-source');
        srcEl.style.outline = '';
        srcEl.style.outlineOffset = '';
      }
    }
    document.querySelectorAll('#boCanvas .bo-canvas-note.bo-connecting-target, #boCanvas .bo-canvas-text-el.bo-connecting-target').forEach(card => {
      card.classList.remove('bo-connecting-target');
    });
    this._boIsConnecting = false;
    this._boConnectSourcePid = null;
    const picker = document.getElementById('boConnectionColorPicker');
    if (picker) picker.remove();
    this._boWaitForConnectSource = true;
    DocEditor.showToast('请点击下一个卡片作为连线起点', 'info');
  },

  /* 完全退出连线模式 */
  _boExitConnectMode() {
    this._boWaitForConnectSource = false;
    if (this._boIsConnecting) {
      if (this._boConnectSourcePid) {
        let srcEl = document.querySelector(`#boCanvas [data-pid="${this._boConnectSourcePid}"]`);
        if (!srcEl) srcEl = document.querySelector(`#boCanvas [data-note-id="${this._boConnectSourcePid}"]`);
        if (srcEl) {
          srcEl.classList.remove('bo-connect-source');
          srcEl.style.outline = '';
          srcEl.style.outlineOffset = '';
        }
      }
      document.querySelectorAll('#boCanvas .bo-canvas-note.bo-connecting-target, #boCanvas .bo-canvas-text-el.bo-connecting-target').forEach(card => {
        card.classList.remove('bo-connecting-target');
      });
      this._boIsConnecting = false;
      this._boConnectSourcePid = null;
      const picker = document.getElementById('boConnectionColorPicker');
      if (picker) picker.remove();
    }
    document.getElementById('boToolConnectBtn')?.classList.remove('active');
    document.getElementById('boCanvasArea')?.classList.remove('connect-mode');
    const indicator = document.getElementById('boModeIndicator');
    if (indicator) indicator.className = 'bo-mode-indicator';
  },

  /* ---------- 战斗连线橡皮擦系统 ---------- */

  /* 切换擦除模式 */
  _boToggleEraseMode() {
    const area = document.getElementById('boCanvasArea');
    if (this._boWaitForConnectSource || this._boIsConnecting) {
      this._boExitConnectMode();
    }
    this._boIsErasingConnections = !this._boIsErasingConnections;
    const btn = document.getElementById('boToolEraseBtn');
    if (btn) btn.classList.toggle('active', this._boIsErasingConnections);
    area?.classList.toggle('erase-mode', this._boIsErasingConnections);
    if (this._boIsErasingConnections) {
      DocEditor.showToast('点击连线即可删除', 'info');
      const indicator = document.getElementById('boModeIndicator');
      if (indicator) {
        indicator.innerHTML = '<div class="bmi-title-row"><span>连线橡皮擦模式</span><button class="bmi-exit-btn" onclick="BoardManager._boExitEraseMode()" title="退出擦除模式">&times;</button></div><span class="bmi-hint">点击连线删除 · 右键退出模式</span>';
        indicator.className = 'bo-mode-indicator';
        void indicator.offsetWidth;
        indicator.className = 'bo-mode-indicator visible erase';
      }
    } else {
      this._boExitEraseMode();
    }
  },

  /* 完全退出擦除模式 */
  _boExitEraseMode() {
    this._boIsErasingConnections = false;
    document.getElementById('boToolEraseBtn')?.classList.remove('active');
    document.getElementById('boCanvasArea')?.classList.remove('erase-mode');
    const indicator = document.getElementById('boModeIndicator');
    if (indicator) indicator.className = 'bo-mode-indicator';
    this._boHideEraseTooltip();
  },

  _boHideEraseTooltip() {
    const tooltip = document.getElementById('boEraseTooltip');
    if (tooltip) tooltip.classList.remove('visible');
  },

  /* 点击连线 */
  _boOnConnectionClick(connIndex) {
    if (this._boIsErasingConnections) {
      this._boDeleteConnection(connIndex);
    }
  },

  /* 删除连线 */
  _boDeleteConnection(connIndex) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.connections) return;
    battle.canvas.connections.splice(connIndex, 1);
    this._boRenderConnections();
    StorageManager.scheduleSave();
  },

  /* 渲染连线 */
  _boRenderConnections() {
    const svg = document.getElementById('boConnectionOverlay');
    if (!svg) return;
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.connections) {
      svg.innerHTML = '';
      return;
    }

    let svgHtml = '<defs>';
    svgHtml += '<marker id="boConnArrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)"/></marker>';
    svgHtml += '<filter id="boConnGlow"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    svgHtml += '</defs>';

    battle.canvas.connections.forEach((conn, idx) => {
      const fromEl = document.querySelector(`#boCanvas [data-pid="${conn.from}"]`) || document.querySelector(`#boCanvas [data-note-id="${conn.from}"]`);
      const toEl = document.querySelector(`#boCanvas [data-pid="${conn.to}"]`) || document.querySelector(`#boCanvas [data-note-id="${conn.to}"]`);
      if (!fromEl || !toEl) return;

      // 同处 #boCanvas，使用虚拟坐标（style.left/top + offset 尺寸）
      const fx = parseFloat(fromEl.style.left || 0) + fromEl.offsetWidth / 2;
      const fy = parseFloat(fromEl.style.top || 0) + fromEl.offsetHeight / 2;
      const tx = parseFloat(toEl.style.left || 0) + toEl.offsetWidth / 2;
      const ty = parseFloat(toEl.style.top || 0) + toEl.offsetHeight / 2;

      const color = conn.color || '#c0ab84';

      // 检测端点是否为纯文字元素，若是则该端透明度渐变为0（照搬流程单元逻辑）
      const fromNote = (battle.canvas.notes || []).find(n => n.id === conn.from);
      const toNote = (battle.canvas.notes || []).find(n => n.id === conn.to);
      const fromIsText = fromNote && fromNote.type === 'text';
      const toIsText = toNote && toNote.type === 'text';
      let strokeAttr = 'stroke="' + color + '"';

      if (fromIsText || toIsText) {
        const gid = 'boConnGrad_' + idx;
        let gradHtml = '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + fx + '" y1="' + fy + '" x2="' + tx + '" y2="' + ty + '">';
        if (fromIsText) {
          gradHtml += '<stop offset="0%" stop-color="' + color + '" stop-opacity="0"/>';
          gradHtml += '<stop offset="30%" stop-color="' + color + '" stop-opacity="1"/>';
        } else {
          gradHtml += '<stop offset="0%" stop-color="' + color + '" stop-opacity="1"/>';
        }
        if (toIsText) {
          gradHtml += '<stop offset="70%" stop-color="' + color + '" stop-opacity="1"/>';
          gradHtml += '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>';
        } else {
          gradHtml += '<stop offset="100%" stop-color="' + color + '" stop-opacity="1"/>';
        }
        gradHtml += '</linearGradient>';
        svgHtml += '<defs>' + gradHtml + '</defs>';
        strokeAttr = 'stroke="url(#' + gid + ')"';
      }

      // 发光层
      svgHtml += '<line x1="' + fx + '" y1="' + fy + '" x2="' + tx + '" y2="' + ty + '" ' + strokeAttr + ' stroke-width="3" stroke-linecap="round" filter="url(#boConnGlow)" opacity="0.15"/>';
      // 主连线
      svgHtml += '<line x1="' + fx + '" y1="' + fy + '" x2="' + tx + '" y2="' + ty + '" ' + strokeAttr + ' stroke-width="2" stroke-linecap="round" opacity="0.5" class="connection-line" data-conn-idx="' + idx + '" onclick="BoardManager._boOnConnectionClick(' + idx + ')" style="pointer-events:stroke;"/>';
      // 流动虚线
      svgHtml += '<line x1="' + fx + '" y1="' + fy + '" x2="' + tx + '" y2="' + ty + '" ' + strokeAttr + ' stroke-width="1.5" stroke-linecap="round" opacity="0.12" style="pointer-events:none;"/>';
      // 流动动画点
      svgHtml += '<circle r="3" fill="' + color + '" opacity="0.8"><animateMotion dur="1.5s" repeatCount="indefinite" path="M' + fx + ',' + fy + ' L' + tx + ',' + ty + '"/></circle>';
    });

    svg.innerHTML = svgHtml;
  },

  /* ---------- 战斗画布纯文本/文字元素 ---------- */

  /* 创建纯文本块 */
  _boCreatePlainText() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    if (!battle.canvas.notes) battle.canvas.notes = [];
    const cs = this._boCanvasState;
    const area = document.getElementById('boCanvasArea');
    const aw = area ? area.clientWidth : 800;
    const ah = area ? area.clientHeight : 600;
    // 视口中心转虚拟坐标
    const cx = cs.x + aw / 2 / cs.scale - 150;
    const cy = cs.y + ah / 2 / cs.scale - 60;
    const block = {
      id: AppState.generateUUID(),
      type: 'plaintext',
      content: '双击编辑文本',
      x: cx,
      y: cy,
      width: 300,
      height: 120,
      style: {
        fontSize: 14, color: '', bgColor: '', align: 'left',
        bold: false, italic: false, underline: false, border: 'solid', opacity: 1
      }
    };
    battle.canvas.notes.push(block);
    this._boRenderCanvasNotes();
    requestAnimationFrame(() => {
      this._boRenderConnections();
    });
    StorageManager.scheduleSave();
    DocEditor.showToast('已添加纯文本块', 'success');
  },

  /* 创建纯文字元素 */
  _boCreateTextElement() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    if (!battle.canvas.notes) battle.canvas.notes = [];
    const cs = this._boCanvasState;
    const area = document.getElementById('boCanvasArea');
    const aw = area ? area.clientWidth : 800;
    const ah = area ? area.clientHeight : 600;
    const cx = cs.x + aw / 2 / cs.scale - 40;
    const cy = cs.y + ah / 2 / cs.scale - 10;
    const textEl = {
      id: AppState.generateUUID(),
      type: 'text',
      content: '双击编辑文字',
      x: cx,
      y: cy,
      width: 100,
      height: 24,
      fontSize: 16,
      color: '#e0d8c8',
      bold: false,
      italic: false
    };
    battle.canvas.notes.push(textEl);
    this._boRenderCanvasNotes();
    requestAnimationFrame(() => {
      this._boRenderConnections();
    });
    StorageManager.scheduleSave();
    DocEditor.showToast('已添加文字', 'success');
  },

  /* 删除画布便签（纯文本/文字元素） */
  _boDeleteCanvasNote(noteId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const idx = battle.canvas.notes.findIndex(n => n.id === noteId);
    if (idx < 0) return;
    battle.canvas.notes.splice(idx, 1);
    // 同时清理与之相关的连线
    if (battle.canvas.connections) {
      battle.canvas.connections = battle.canvas.connections.filter(c => c.from !== noteId && c.to !== noteId);
    }
    this._boRenderCanvasNotes();
    this._boRenderConnections();
    StorageManager.scheduleSave();
  },

  /* 编辑纯文本块（照搬流程单元弹窗 UI） */
  _boEditPlainText(noteId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const note = battle.canvas.notes.find(n => n.id === noteId);
    if (!note) return;

    this._boCloseEditModal();
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'boNoteEditModal';

    const style = note.style || {};
    let bodyHtml = '';

    // 文本内容
    bodyHtml += `<div class="pt-edit-section"><label>文本内容</label>`;
    bodyHtml += `<textarea id="boPtContent" style="width:100%;height:120px;border:1px solid var(--border);border-radius:6px;padding:8px;font-size:13px;resize:vertical;outline:none;background:#f8f8f7;color:var(--text);box-sizing:border-box;">${this._esc(note.content || '')}</textarea></div>`;

    // 字体大小 + 透明度
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">字号</label>`;
    bodyHtml += `<input type="number" id="boPtFontSize" value="${style.fontSize || 14}" min="10" max="48" step="1" style="width:60px;background:#f8f8f7;">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);min-width:40px;">透明度</label>`;
    bodyHtml += `<input type="range" id="boPtOpacity" min="0.1" max="1" step="0.05" value="${style.opacity !== undefined ? style.opacity : 1}" style="flex:1;"><span id="boPtOpacityVal" style="font-size:12px;color:var(--text-muted);min-width:30px;">${Math.round((style.opacity !== undefined ? style.opacity : 1) * 100)}%</span></div>`;

    // 颜色
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">文字颜色</label>`;
    bodyHtml += `<input type="color" id="boPtColor" value="${style.color || '#333333'}">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);min-width:60px;">背景颜色</label>`;
    bodyHtml += `<input type="color" id="boPtBgColor" value="${style.bgColor || '#ffffff'}">`;
    bodyHtml += `<button class="pt-style-btn" id="boPtClearBg" title="清除背景色" style="font-size:11px;width:auto;padding:0 6px;">清除</button></div>`;

    // 对齐 + 样式按钮
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">对齐</label>`;
    const aligns = ['left', 'center', 'right'];
    const alignIcons = ['◀', '◆', '▶'];
    aligns.forEach((a, i) => {
      const active = (style.align || 'left') === a ? ' active' : '';
      bodyHtml += `<button class="pt-style-btn${active} bo-pt-align-btn" data-align="${a}" title="${a}">${alignIcons[i]}</button>`;
    });
    bodyHtml += `<span style="width:12px;"></span>`;
    const boldActive = style.bold ? ' active' : '';
    const italicActive = style.italic ? ' active' : '';
    const underlineActive = style.underline ? ' active' : '';
    bodyHtml += `<button class="pt-style-btn${boldActive}" id="boPtBoldBtn" title="粗体" style="font-weight:700;">B</button>`;
    bodyHtml += `<button class="pt-style-btn${italicActive}" id="boPtItalicBtn" title="斜体" style="font-style:italic;">I</button>`;
    bodyHtml += `<button class="pt-style-btn${underlineActive}" id="boPtUnderlineBtn" title="下划线" style="text-decoration:underline;">U</button></div>`;

    // 边框
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">边框</label>`;
    const borders = ['solid', 'dashed', 'none'];
    const borderLabels = ['实线', '虚线', '无边框'];
    borders.forEach((b, i) => {
      const active = (style.border || 'solid') === b ? ' active' : '';
      bodyHtml += `<button class="pt-style-btn${active} bo-pt-border-btn" data-border="${b}" title="${borderLabels[i]}" style="width:auto;padding:0 8px;font-size:11px;">${borderLabels[i]}</button>`;
    });
    bodyHtml += `</div>`;

    modal.innerHTML = `
      <div class="board-edit-modal-content">
        <div class="board-edit-header">
          <h3>编辑纯文本</h3>
          <button class="bo-modal-close-btn"><span class="icon"><svg><use href="#i-x"/></svg></span></button>
        </div>
        <div class="board-edit-body">${bodyHtml}</div>
        <div class="board-edit-footer">
          <button class="bo-modal-cancel-btn">取消</button>
          <button class="btn-accent bo-modal-save-btn">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 绑定按钮事件
    const self = this;
    modal.querySelector('.bo-modal-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-save-btn').addEventListener('click', () => {
      self._boSavePlainTextEdit(noteId);
      modal.remove();
    });
    // 内联按钮
    const ptClearBg = modal.querySelector('#boPtClearBg');
    if (ptClearBg) ptClearBg.addEventListener('click', () => { const el = modal.querySelector('#boPtBgColor'); if (el) el.value = ''; });
    modal.querySelectorAll('.bo-pt-align-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.bo-pt-align-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    ['boPtBoldBtn', 'boPtItalicBtn', 'boPtUnderlineBtn'].forEach(id => {
      const b = modal.querySelector('#' + id);
      if (b) b.addEventListener('click', () => b.classList.toggle('active'));
    });
    modal.querySelectorAll('.bo-pt-border-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.bo-pt-border-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 透明度滑块实时更新
    const opacityInput = modal.querySelector('#boPtOpacity');
    const opacityVal = modal.querySelector('#boPtOpacityVal');
    if (opacityInput && opacityVal) {
      opacityInput.addEventListener('input', () => {
        opacityVal.textContent = Math.round(opacityInput.value * 100) + '%';
      });
    }
  },

  /* 保存纯文本编辑 */
  _boSavePlainTextEdit(noteId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const note = battle.canvas.notes.find(n => n.id === noteId);
    if (!note) return;

    const modal = document.getElementById('boNoteEditModal');
    if (!modal) return;

    if (!note.style) note.style = {};
    note.content = modal.querySelector('#boPtContent')?.value || '';
    note.style.fontSize = parseInt(modal.querySelector('#boPtFontSize')?.value) || 14;
    note.style.color = modal.querySelector('#boPtColor')?.value || '#333333';
    const bgColor = modal.querySelector('#boPtBgColor')?.value;
    note.style.bgColor = bgColor || undefined;
    note.style.align = (modal.querySelector('.bo-pt-align-btn.active')?.dataset.align) || 'left';
    note.style.border = (modal.querySelector('.bo-pt-border-btn.active')?.dataset.border) || 'solid';
    note.style.opacity = parseFloat(modal.querySelector('#boPtOpacity')?.value) || 1;
    note.style.bold = modal.querySelector('#boPtBoldBtn')?.classList.contains('active') || false;
    note.style.italic = modal.querySelector('#boPtItalicBtn')?.classList.contains('active') || false;
    note.style.underline = modal.querySelector('#boPtUnderlineBtn')?.classList.contains('active') || false;

    this._boRenderCanvasNotes();
    StorageManager.scheduleSave();
  },

  /* 编辑文字元素（照搬流程单元弹窗 UI） */
  _boEditTextElement(noteId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const note = battle.canvas.notes.find(n => n.id === noteId);
    if (!note) return;

    this._boCloseEditModal();
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'boNoteEditModal';

    let bodyHtml = '';
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">内容</label>`;
    bodyHtml += `<textarea id="boTeContent" rows="3" style="flex:1;background:#f8f8f7;border:1px solid #d0d0d0;border-radius:6px;color:#343434;padding:8px;font-size:13px;resize:vertical;outline:none;">${this._esc(note.content || '')}</textarea></div>`;
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">字号</label>`;
    bodyHtml += `<input type="number" id="boTeFontSize" value="${note.fontSize || 16}" min="10" max="72" style="width:60px;background:#f8f8f7;border:1px solid #d0d0d0;border-radius:4px;color:#343434;padding:4px 8px;outline:none;">`;
    bodyHtml += `<label style="font-size:12px;color:var(--text-muted);margin-left:12px;">颜色</label>`;
    bodyHtml += `<input type="color" id="boTeColor" value="${note.color || '#e0d8c8'}" style="width:32px;height:28px;border:none;background:transparent;cursor:pointer;"></div>`;
    bodyHtml += `<div class="pt-edit-row"><label style="font-size:12px;color:var(--text-muted);min-width:60px;">样式</label>`;
    const boldActive = note.bold ? ' active' : '';
    const italicActive = note.italic ? ' active' : '';
    bodyHtml += `<button class="pt-style-btn${boldActive}" id="boTeBoldBtn" title="粗体" style="font-weight:700;">B</button>`;
    bodyHtml += `<button class="pt-style-btn${italicActive}" id="boTeItalicBtn" title="斜体" style="font-style:italic;">I</button></div>`;

    modal.innerHTML = `
      <div class="board-edit-modal-content">
        <div class="board-edit-header">
          <h3>编辑文字</h3>
          <button class="bo-modal-close-btn"><span class="icon"><svg><use href="#i-x"/></svg></span></button>
        </div>
        <div class="board-edit-body">${bodyHtml}</div>
        <div class="board-edit-footer">
          <button class="bo-modal-cancel-btn">取消</button>
          <button class="btn-accent bo-modal-save-btn">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 绑定按钮事件
    const self = this;
    modal.querySelector('.bo-modal-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-save-btn').addEventListener('click', () => {
      self._boSaveTextElementEdit(noteId);
      modal.remove();
    });
    ['boTeBoldBtn', 'boTeItalicBtn'].forEach(id => {
      const b = modal.querySelector('#' + id);
      if (b) b.addEventListener('click', () => b.classList.toggle('active'));
    });
  },

  /* 保存文字元素编辑 */
  _boSaveTextElementEdit(noteId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const note = battle.canvas.notes.find(n => n.id === noteId);
    if (!note) return;

    const modal = document.getElementById('boNoteEditModal');
    if (!modal) return;

    note.content = modal.querySelector('#boTeContent')?.value || '';
    note.fontSize = parseInt(modal.querySelector('#boTeFontSize')?.value) || 16;
    note.color = modal.querySelector('#boTeColor')?.value || '#e0d8c8';
    note.bold = modal.querySelector('#boTeBoldBtn')?.classList.contains('active') || false;
    note.italic = modal.querySelector('#boTeItalicBtn')?.classList.contains('active') || false;

    this._boRenderCanvasNotes();
    StorageManager.scheduleSave();
  },

  /* 关闭战斗模块编辑弹窗（仅用于编辑前清理旧弹窗） */
  _boCloseEditModal() {
    const modal = document.getElementById('boNoteEditModal');
    if (modal) modal.remove();
  },

  /* ---------- 背景框 ---------- */

  /* 创建背景框 */
  _boCreateBackgroundFrame() {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    if (!battle.canvas.backgroundFrames) battle.canvas.backgroundFrames = [];
    const cs = this._boCanvasState;
    const area = document.getElementById('boCanvasArea');
    const aw = area ? area.clientWidth : 800;
    const ah = area ? area.clientHeight : 600;
    const cx = cs.x + aw / 2 / cs.scale - 200;
    const cy = cs.y + ah / 2 / cs.scale - 150;
    const frame = {
      id: AppState.generateUUID(),
      type: 'background_frame',
      x: cx,
      y: cy,
      width: 400,
      height: 300,
      locked: false,
      style: {
        borderWidth: 2,
        borderColor: '#c0ab84',
        borderOpacity: 0.8,
        bgColor: '#3a3a4a',
        bgOpacity: 0.25
      }
    };
    battle.canvas.backgroundFrames.push(frame);
    this._boRenderBackgroundFrames();
    this._boSelectBgFrame(frame.id);
    StorageManager.scheduleSave();
    DocEditor.showToast('已添加背景框', 'success');
  },

  /* 渲染所有背景框 */
  _boRenderBackgroundFrames() {
    const canvas = document.getElementById('boCanvas');
    if (!canvas) return;
    const battle = this._getCurrentBattle();
    if (!battle) return;

    // 向后兼容
    if (!battle.canvas.backgroundFrames) battle.canvas.backgroundFrames = [];

    // 清除旧背景框
    canvas.querySelectorAll('.bo-bg-frame').forEach(el => el.remove());

    // 渲染在 SVG 之后、便签之前
    const svgOverlay = document.getElementById('boConnectionOverlay');
    const insertAfter = svgOverlay || canvas.firstChild;

    battle.canvas.backgroundFrames.forEach(frame => {
      const s = frame.style || {};
      const el = document.createElement('div');
      el.className = 'bo-bg-frame';
      el.setAttribute('data-bg-frame-id', frame.id);
      el.dataset.type = 'background_frame';

      const bw = s.borderWidth || 2;
      const bc = s.borderColor || '#c0ab84';
      const bo = s.borderOpacity !== undefined ? s.borderOpacity : 0.8;
      const bgc = s.bgColor || '#3a3a4a';
      const bgo = s.bgOpacity !== undefined ? s.bgOpacity : 0.25;

      el.style.cssText =
        'left:' + frame.x + 'px;' +
        'top:' + frame.y + 'px;' +
        'width:' + (frame.width || 400) + 'px;' +
        'height:' + (frame.height || 300) + 'px;' +
        'border:' + bw + 'px solid ' + this._rgbaFromHex(bc, bo) + ';' +
        'background-color:' + this._rgbaFromHex(bgc, bgo) + ';' +
        'z-index:0;';

      if (frame.id === this._boSelectedBgFrame) {
        el.classList.add('selected');
      }

      if (frame.locked) {
        el.classList.add('locked');
        el.style.cursor = 'default';
      }

      // 尺寸调节手柄（锁定时不显示）
      if (!frame.locked) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'bg-frame-resize';
        resizeHandle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          BoardManager._boStartBgFrameResize(e, frame.id);
        });
        el.appendChild(resizeHandle);
      }

      // 点击：选中该背景框（锁定时跳过拖拽）
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.bg-frame-resize')) return;
        e.stopPropagation();
        this._boSelectBgFrame(frame.id);
        if (!frame.locked) {
          this._boStartBgFrameDrag(e, frame.id);
        }
      });

      // 双击：编辑
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._boEditBackgroundFrame(frame.id);
      });

      // 右键菜单
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._boSelectBgFrame(frame.id);
        this._boShowBgFrameCtxMenu(e.clientX, e.clientY, frame.id);
      });

      // 点击空白处取消选择
      el.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      if (insertAfter.nextSibling) {
        canvas.insertBefore(el, insertAfter.nextSibling);
      } else {
        canvas.appendChild(el);
      }
    });
  },

  /* 选中背景框 */
  _boSelectBgFrame(frameId) {
    if (this._boSelectedBgFrame === frameId) return;
    this._boSelectedBgFrame = frameId;
    // 更新视觉
    document.querySelectorAll('.bo-bg-frame').forEach(el => {
      const id = el.getAttribute('data-bg-frame-id');
      el.classList.toggle('selected', id === frameId);
    });
  },

  /* 取消所有背景框选中 */
  _boDeselectBgFrame() {
    if (!this._boSelectedBgFrame) return;
    this._boSelectedBgFrame = null;
    document.querySelectorAll('.bo-bg-frame.selected').forEach(el => el.classList.remove('selected'));
  },

  /* 开始拖拽背景框 */
  _boStartBgFrameDrag(e, frameId) {
    const el = document.querySelector('#boCanvas .bo-bg-frame[data-bg-frame-id="' + frameId + '"]');
    if (!el) return;
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    e.stopPropagation();
    this._boBgFrameDragging = true;
    const startX = e.clientX, startY = e.clientY;
    const origX = frame.x, origY = frame.y;
    const cs = this._boCanvasState;

    // Alt 拖拽 → 快速复制
    const isAltDrag = e.altKey;
    let newFrameId = null;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / cs.scale;
      const dy = (ev.clientY - startY) / cs.scale;

      if (isAltDrag && !newFrameId && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        // 开始 Alt 复制
        newFrameId = AppState.generateUUID();
        const newFrame = {
          id: newFrameId,
          type: 'background_frame',
          x: origX,
          y: origY,
          width: frame.width,
          height: frame.height,
          locked: false,
          style: Object.assign({}, frame.style)
        };
        battle.canvas.backgroundFrames.push(newFrame);
        this._boRenderBackgroundFrames();
        this._boSelectBgFrame(newFrameId);
        // 切换拖拽目标到新 frame
        const newEl = document.querySelector('#boCanvas .bo-bg-frame[data-bg-frame-id="' + newFrameId + '"]');
        if (newEl) {
          newEl.style.left = (origX + dx) + 'px';
          newEl.style.top = (origY + dy) + 'px';
        }
        return;
      }

      if (isAltDrag && newFrameId) {
        const newFrame = battle.canvas.backgroundFrames.find(f => f.id === newFrameId);
        if (newFrame) {
          newFrame.x = origX + dx;
          newFrame.y = origY + dy;
          const newEl = document.querySelector('#boCanvas .bo-bg-frame[data-bg-frame-id="' + newFrameId + '"]');
          if (newEl) {
            newEl.style.left = newFrame.x + 'px';
            newEl.style.top = newFrame.y + 'px';
          }
        }
      } else {
        frame.x = origX + dx;
        frame.y = origY + dy;
        el.style.left = frame.x + 'px';
        el.style.top = frame.y + 'px';
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._boBgFrameDragging = false;
      StorageManager.scheduleSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* 开始调整背景框尺寸 */
  _boStartBgFrameResize(e, frameId) {
    const el = document.querySelector('#boCanvas .bo-bg-frame[data-bg-frame-id="' + frameId + '"]');
    if (!el) return;
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    e.stopPropagation();
    e.preventDefault();

    const s = this._boCanvasState.scale;
    const startX = e.clientX, startY = e.clientY;
    const startW = frame.width || 400;
    const startH = frame.height || 300;

    const onMove = (ev) => {
      const dw = (ev.clientX - startX) / s;
      const dh = (ev.clientY - startY) / s;
      frame.width = Math.max(80, startW + dw);
      frame.height = Math.max(60, startH + dh);
      el.style.width = frame.width + 'px';
      el.style.height = frame.height + 'px';
      this._boRenderMinimap();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      StorageManager.scheduleSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* 编辑背景框（弹窗） */
  _boEditBackgroundFrame(frameId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    this._boCloseEditModal();
    const modal = document.createElement('div');
    modal.className = 'board-edit-modal';
    modal.id = 'boNoteEditModal';

    const s = frame.style || {};

    let bodyHtml = '';
    // 边框区域
    bodyHtml += '<div class="bg-frame-edit-section">';
    bodyHtml += '<label class="section-title">边框</label>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>粗细</label>';
    bodyHtml += '<input type="number" id="bgBorderWidth" value="' + (s.borderWidth || 2) + '" min="1" max="20" step="1">';
    bodyHtml += '<label>px</label></div>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>颜色</label>';
    bodyHtml += '<input type="color" id="bgBorderColor" value="' + (s.borderColor || '#c0ab84') + '">';
    bodyHtml += '<label style="min-width:24px;">透明</label>';
    bodyHtml += '<input type="range" id="bgBorderOpacity" min="0" max="1" step="0.05" value="' + (s.borderOpacity !== undefined ? s.borderOpacity : 0.8) + '">';
    bodyHtml += '<span class="opacity-val" id="bgBorderOpacityVal">' + Math.round((s.borderOpacity !== undefined ? s.borderOpacity : 0.8) * 100) + '%</span></div>';
    bodyHtml += '</div>';

    // 底色区域
    bodyHtml += '<div class="bg-frame-edit-section">';
    bodyHtml += '<label class="section-title">底色</label>';
    bodyHtml += '<div class="bg-frame-edit-row">';
    bodyHtml += '<label>颜色</label>';
    bodyHtml += '<input type="color" id="bgBgColor" value="' + (s.bgColor || '#3a3a4a') + '">';
    bodyHtml += '<label style="min-width:24px;">透明</label>';
    bodyHtml += '<input type="range" id="bgBgOpacity" min="0" max="1" step="0.05" value="' + (s.bgOpacity !== undefined ? s.bgOpacity : 0.25) + '">';
    bodyHtml += '<span class="opacity-val" id="bgBgOpacityVal">' + Math.round((s.bgOpacity !== undefined ? s.bgOpacity : 0.25) * 100) + '%</span></div>';
    bodyHtml += '</div>';

    // 操作按钮
    bodyHtml += '<div class="bg-frame-edit-actions">';
    bodyHtml += '<button id="bgDupBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> 快速复制</button>';
    bodyHtml += '<button class="danger" id="bgDelBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg> 删除背景框</button>';
    bodyHtml += '</div>';

    modal.innerHTML =
      '<div class="board-edit-modal-content">' +
        '<div class="board-edit-header">' +
          '<h3>编辑背景框</h3>' +
          '<button class="bo-modal-close-btn"><span class="icon"><svg><use href="#i-x"/></svg></span></button>' +
        '</div>' +
        '<div class="board-edit-body">' + bodyHtml + '</div>' +
        '<div class="board-edit-footer">' +
          '<button class="bo-modal-cancel-btn">取消</button>' +
          '<button class="btn-accent bo-modal-save-btn">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const self = this;
    modal.querySelector('.bo-modal-close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-cancel-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.bo-modal-save-btn').addEventListener('click', () => {
      self._boSaveBackgroundFrameEdit(frameId);
      modal.remove();
    });

    // 透明度滑块实时更新
    const boSlider = modal.querySelector('#bgBorderOpacity');
    const boVal = modal.querySelector('#bgBorderOpacityVal');
    if (boSlider && boVal) { boSlider.addEventListener('input', () => { boVal.textContent = Math.round(boSlider.value * 100) + '%'; }); }
    const bgoSlider = modal.querySelector('#bgBgOpacity');
    const bgoVal = modal.querySelector('#bgBgOpacityVal');
    if (bgoSlider && bgoVal) { bgoSlider.addEventListener('input', () => { bgoVal.textContent = Math.round(bgoSlider.value * 100) + '%'; }); }

    // 快速复制按钮
    const dupBtn = modal.querySelector('#bgDupBtn');
    if (dupBtn) dupBtn.addEventListener('click', () => {
      const newId = self._boDuplicateBackgroundFrame(frameId);
      if (newId) {
        modal.remove();
        self._boEditBackgroundFrame(newId);
      }
    });

    // 删除按钮
    const delBtn = modal.querySelector('#bgDelBtn');
    if (delBtn) delBtn.addEventListener('click', () => {
      self._boDeleteBackgroundFrame(frameId);
      modal.remove();
    });
  },

  /* 保存背景框编辑 */
  _boSaveBackgroundFrameEdit(frameId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;

    const modal = document.getElementById('boNoteEditModal');
    if (!modal) return;

    if (!frame.style) frame.style = {};
    frame.style.borderWidth = parseInt(modal.querySelector('#bgBorderWidth')?.value) || 2;
    frame.style.borderColor = modal.querySelector('#bgBorderColor')?.value || '#c0ab84';
    frame.style.borderOpacity = parseFloat(modal.querySelector('#bgBorderOpacity')?.value) || 0.8;
    frame.style.bgColor = modal.querySelector('#bgBgColor')?.value || '#3a3a4a';
    frame.style.bgOpacity = parseFloat(modal.querySelector('#bgBgOpacity')?.value) || 0.25;

    this._boRenderBackgroundFrames();
    StorageManager.scheduleSave();
  },

  /* 删除背景框 */
  _boDeleteBackgroundFrame(frameId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const idx = battle.canvas.backgroundFrames.findIndex(f => f.id === frameId);
    if (idx < 0) return;
    battle.canvas.backgroundFrames.splice(idx, 1);
    if (this._boSelectedBgFrame === frameId) this._boSelectedBgFrame = null;
    this._boRenderBackgroundFrames();
    StorageManager.scheduleSave();
    DocEditor.showToast('已删除背景框', 'success');
  },

  /* 切换背景框锁定状态 */
  _boToggleBgFrameLock(frameId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return;
    frame.locked = !frame.locked;
    this._boRenderBackgroundFrames();
    if (!frame.locked) {
      this._boSelectBgFrame(frameId);
    }
    StorageManager.scheduleSave();
    DocEditor.showToast(frame.locked ? '已锁定背景框' : '已解锁背景框', 'success');
  },

  /* 复制背景框，返回新 ID */
  _boDuplicateBackgroundFrame(frameId) {
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.backgroundFrames) return null;
    const frame = battle.canvas.backgroundFrames.find(f => f.id === frameId);
    if (!frame) return null;

    const newFrame = {
      id: AppState.generateUUID(),
      type: 'background_frame',
      x: frame.x + 40,
      y: frame.y + 30,
      width: frame.width,
      height: frame.height,
      locked: false,
      style: Object.assign({}, frame.style)
    };
    battle.canvas.backgroundFrames.push(newFrame);
    this._boRenderBackgroundFrames();
    this._boSelectBgFrame(newFrame.id);
    StorageManager.scheduleSave();
    DocEditor.showToast('已复制背景框', 'success');
    return newFrame.id;
  },

  /* 背景框右键菜单 */
  _boShowBgFrameCtxMenu(screenX, screenY, frameId) {
    this._boHideBgFrameCtxMenu();
    const menu = document.getElementById('boBgFrameCtxMenu');
    if (!menu) return;

    // 更新锁定按钮文字
    const battle = this._getCurrentBattle();
    const frame = battle && battle.canvas.backgroundFrames ? battle.canvas.backgroundFrames.find(f => f.id === frameId) : null;
    const lockBtn = document.getElementById('boBgFrameCtxLockBtn');
    if (lockBtn && frame) {
      const isLocked = frame.locked;
      const lockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
      const unlockIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>';
      lockBtn.innerHTML = '<span class="icon">' + (isLocked ? unlockIcon : lockIcon) + '</span> ' + (isLocked ? '解锁背景框' : '锁定背景框');
    }

    const area = document.getElementById('boCanvasArea');
    const areaRect = area.getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.left = (screenX - areaRect.left) + 'px';
    menu.style.top = (screenY - areaRect.top) + 'px';

    // 绑定事件
    const editBtn = document.getElementById('boBgFrameCtxEditBtn');
    const lockBtn2 = document.getElementById('boBgFrameCtxLockBtn');
    const dupBtn = document.getElementById('boBgFrameCtxDupBtn');
    const delBtn = document.getElementById('boBgFrameCtxDelBtn');
    const self = this;

    const cleanOld = (el) => { if (el._onclick) el.removeEventListener('click', el._onclick); };

    cleanOld(editBtn); cleanOld(lockBtn2); cleanOld(dupBtn); cleanOld(delBtn);

    const editHandler = () => { self._boHideBgFrameCtxMenu(); self._boEditBackgroundFrame(frameId); };
    const lockHandler = () => { self._boHideBgFrameCtxMenu(); self._boToggleBgFrameLock(frameId); };
    const dupHandler = () => { self._boHideBgFrameCtxMenu(); self._boDuplicateBackgroundFrame(frameId); };
    const delHandler = () => { self._boHideBgFrameCtxMenu(); self._boDeleteBackgroundFrame(frameId); };

    editBtn._onclick = editHandler; editBtn.addEventListener('click', editHandler);
    lockBtn2._onclick = lockHandler; lockBtn2.addEventListener('click', lockHandler);
    dupBtn._onclick = dupHandler; dupBtn.addEventListener('click', dupHandler);
    delBtn._onclick = delHandler; delBtn.addEventListener('click', delHandler);

    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._boHideBgFrameCtxMenu();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  },

  _boHideBgFrameCtxMenu() {
    const menu = document.getElementById('boBgFrameCtxMenu');
    if (menu) menu.style.display = 'none';
  },

  /* 工具函数：hex颜色 + 透明度转 rgba */
  _rgbaFromHex(hex, alpha) {
    if (!hex) hex = '#000000';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, alpha)) + ')';
  },

  /* 开始拖拽纯文本块 */
  _boStartPlainTextDrag(e, noteId) {
    const el = document.querySelector(`#boCanvas [data-note-id="${noteId}"]`);
    if (!el) return;
    const battle = this._getCurrentBattle();
    if (!battle || !battle.canvas.notes) return;
    const note = battle.canvas.notes.find(n => n.id === noteId);
    if (!note) return;
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const origX = note.x, origY = note.y;
    const cs = this._boCanvasState;
    const onMove = (ev) => {
      note.x = origX + (ev.clientX - startX) / cs.scale;
      note.y = origY + (ev.clientY - startY) / cs.scale;
      el.style.left = note.x + 'px';
      el.style.top = note.y + 'px';
      this._boRenderConnections();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      StorageManager.scheduleSave();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* 战斗画布：尺寸调节 */
  _boStartResize(e, targetId, type) {
    const el = e.currentTarget.closest('.bo-canvas-note');
    if (!el) return;
    const battle = this._getCurrentBattle();
    if (!battle) return;

    let target;
    if (type === 'participant') {
      target = battle.participants.find(p => p.id === targetId);
    } else if (type === 'note') {
      target = battle.canvas.notes.find(n => n.id === targetId);
    }
    if (!target) return;

    const cs = this._boCanvasState;
    const rect = el.getBoundingClientRect();
    const startVW = rect.width / cs.scale;
    const startVH = rect.height / cs.scale;
    const startX = e.clientX, startY = e.clientY;

    this._boIsResizing = true;
    this._boResizeTarget = { id: targetId, type, startVW, startVH };
    this._boHideQuickView();

    const onMove = (ev) => {
      const deltaW = (ev.clientX - startX) / cs.scale;
      const deltaH = (ev.clientY - startY) / cs.scale;
      let newW = Math.max(120, startVW + deltaW);
      let newH = Math.max(60, startVH + deltaH);

      if (type === 'participant') {
        target._canvasWidth = newW;
        target._canvasMaxHeight = newH;
        el.style.width = newW + 'px';
        el.style.maxHeight = newH + 'px';
      } else {
        target.width = newW;
        target.height = newH;
        el.style.width = newW + 'px';
        el.style.height = newH + 'px';
      }
      this._boRenderConnections();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._boIsResizing = false;
      this._boResizeTarget = null;
      StorageManager.scheduleSave();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  /* ---------- 子画布系统 ---------- */
  _boInitCanvas() {
    const area = document.getElementById('boCanvasArea');
    const battle = this._getCurrentBattle();
    if (!area || !battle) return;

    // 清理旧的事件监听器，防止累积泄漏
    if (this._boCanvasCleanup) {
      this._boCanvasCleanup();
      this._boCanvasCleanup = null;
    }

    // 恢复视口
    const vp = battle.canvas.viewport;
    this._boCanvasState = { x: vp.x, y: vp.y, scale: vp.scale, panning: false, startX: 0, startY: 0, startVpX: 0, startVpY: 0 };
    this._boUpdateCanvasTransform();

    // 初始化工具栏角标
    const corners = ['tl', 'tr', 'br', 'bl'];
    document.querySelectorAll('.bo-connection-tools .tool-btn').forEach(btn => {
      if (btn.querySelector('.tool-btn-corner')) return;
      corners.forEach(c => {
        const el = document.createElement('div');
        el.className = 'tool-btn-corner ' + c;
        btn.appendChild(el);
      });
    });

    // 初始化擦除气泡事件
    const tooltip = document.getElementById('boEraseTooltip');
    if (tooltip) tooltip.classList.remove('visible');

    // 绑定画布事件
    area.onmousedown = (e) => this._boCanvasMouseDown(e);
    area.onwheel = (e) => this._boCanvasWheel(e);
    area.oncontextmenu = (e) => e.preventDefault();

    // 鸟瞰图点击导航
    const minimap = document.getElementById('boMinimap');
    if (minimap) minimap.onclick = (e) => this._boOnMinimapClick(e);

    const moveHandler = (e) => this._boOnCanvasMouseMove(e);
    const upHandler = (e) => this._boOnCanvasMouseUp(e);
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    this._boCanvasCleanup = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
  },

  _boUpdateCanvasTransform() {
    const canvas = document.getElementById('boCanvas');
    const cs = this._boCanvasState;
    const s = cs.scale;
    canvas.style.transform = 'translate(' + (-cs.x * s) + 'px, ' + (-cs.y * s) + 'px) scale(' + s + ')';
    canvas.style.transformOrigin = '0 0';
  },

  _boCanvasMouseDown(e) {
    if (e.target.closest('.bo-canvas-note')) return;
    if (e.target.closest('.bo-bg-frame')) return;
    if (e.target.closest('.bo-minimap')) return;
    if (e.target.closest('.bo-canvas-ctx-menu')) return;
    // 隐藏右键菜单
    this._boHideCanvasCtxMenu();
    this._boHideBgFrameCtxMenu();
    if (e.button === 2) {
      e.preventDefault();
      // 右键退出连线/擦除模式
      if (this._boIsConnecting || this._boWaitForConnectSource) {
        this._boExitConnectMode();
        return;
      }
      if (this._boIsErasingConnections) {
        this._boExitEraseMode();
        return;
      }
      // 右键在目标模式下取消选择
      if (this._boTargetMode) {
        this._boCancelTargetMode();
        return;
      }
      this._boCanvasState.panning = true;
      this._boCanvasState.startX = e.clientX;
      this._boCanvasState.startY = e.clientY;
      this._boCanvasState.startVpX = this._boCanvasState.x;
      this._boCanvasState.startVpY = this._boCanvasState.y;
      document.getElementById('boCanvasArea').style.cursor = 'grabbing';
    } else if (e.button === 0) {
      // 左键点击空白处：取消背景框选中
      this._boDeselectBgFrame();
      // 左键：在目标模式下开始框选
      if (this._boTargetMode) {
        this._boStartBoxSelect(e);
      }
    }
  },

  _boOnCanvasMouseMove(e) {
    if (this._boCanvasState.panning) {
      const cs = this._boCanvasState;
      const dx = e.clientX - cs.startX;
      const dy = e.clientY - cs.startY;
      cs.x = cs.startVpX - dx / cs.scale;
      cs.y = cs.startVpY - dy / cs.scale;
      this._boUpdateCanvasTransform();
      this._boRenderMinimap();
    }
    if (this._boBoxSelect && this._boBoxSelect.active) {
      this._boUpdateBoxSelect(e);
    }
    // 擦除模式：跟随气泡
    if (this._boIsErasingConnections) {
      const tooltip = document.getElementById('boEraseTooltip');
      if (tooltip) {
        tooltip.style.left = (e.clientX + 16) + 'px';
        tooltip.style.top = (e.clientY + 8) + 'px';
        if (e.target.closest && e.target.closest('.connection-line')) {
          tooltip.classList.add('visible');
        } else {
          tooltip.classList.remove('visible');
        }
      }
    }
  },

  _boOnCanvasMouseUp(e) {
    if (this._boCanvasState.panning) {
      this._boCanvasState.panning = false;
      const area = document.getElementById('boCanvasArea');
      if (area) area.style.cursor = '';
      // 保存视口
      const battle = this._getCurrentBattle();
      if (battle) {
        battle.canvas.viewport.x = this._boCanvasState.x;
        battle.canvas.viewport.y = this._boCanvasState.y;
      }
      this._boRenderMinimap();
    }
    if (this._boBoxSelect && this._boBoxSelect.active) {
      this._boEndBoxSelect(e);
    }
  },

  _boCanvasWheel(e) {
    e.preventDefault();
    const cs = this._boCanvasState;
    if (e.ctrlKey) {
      // 缩放
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.max(0.3, Math.min(3.0, cs.scale + delta));
      cs.scale = newScale;
    } else {
      // 平移
      const s = cs.scale;
      if (e.shiftKey) cs.x += e.deltaY / s;
      else { cs.x += e.deltaX / s; cs.y += e.deltaY / s; }
    }
    this._boUpdateCanvasTransform();
    // 保存视口
    const battle = this._getCurrentBattle();
    if (battle) {
      battle.canvas.viewport.x = cs.x;
      battle.canvas.viewport.y = cs.y;
      battle.canvas.viewport.scale = cs.scale;
    }
    this._boRenderMinimap();
  },

  /* ---------- 画布上的便签渲染 ---------- */
  _boRenderCanvasNotes() {
    const canvas = document.getElementById('boCanvas');
    if (!canvas) return;
    const battle = this._getCurrentBattle();
    if (!battle) return;

    // 清除旧的
    canvas.querySelectorAll('.bo-canvas-note').forEach(el => el.remove());
    canvas.querySelectorAll('.bo-canvas-text-el').forEach(el => el.remove());

    battle.participants.forEach(p => {
      const ct = this._getCombatTracker(p);
      const cd = this._getParticipantCharData(p);
      const isCustom = SystemManager.getCurrentSystem() !== 'dnd5r';
      const displayName = isCustom
        ? ((cd.fields && cd.fields._name) || cd.name || p.instanceName || '未命名')
        : (p.instanceName || '未命名');

      const el = document.createElement('div');
      el.className = 'bo-canvas-note';
      el.setAttribute('data-pid', p.id);
      el.style.left = (p.x || 100) + 'px';
      el.style.top = (p.y || 100) + 'px';
      const cw = p._canvasWidth || 280;
      const ch = p._canvasMaxHeight || 400;
      el.style.width = cw + 'px';
      el.style.maxHeight = ch + 'px';
      el.style.overflowY = 'auto';
      el.style.scrollbarWidth = 'thin';
      el.style.scrollbarColor = 'rgba(255,255,255,0.1) transparent';

      // 当前行动者高亮
      const tt = battle.turnTracker;
      if (tt.isActive && tt.orderedIds[tt.currentIndex] === p.id) {
        el.classList.add('turn-active');
      }
      // 目标选中态
      if (this._boSelectedTargets && this._boSelectedTargets.includes(p.id)) {
        el.classList.add('target-hover');
      }

      // 复用外部角色便签的完整渲染
      let html = '<div class="note-header">';
      html += '<span class="type-badge">' + (p.faction === 'pc' ? 'PC' : p.faction === 'enemy_npc' ? '敌方NPC' : '友方NPC') + '</span>';
      html += '<span class="note-title">' + this._esc(displayName) + '</span>';
      html += '</div>';

      // 战斗追踪数据（HP条 + 状态）
      const maxHp = ct ? ct.maxHp : null;
      const curHp = ct ? ct.currentHp : null;
      const tmpHp = ct ? (ct.tempHp || 0) : 0;
      const pct = (maxHp > 0 && curHp !== null) ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
      const hpColor = curHp === null ? '#666' : (curHp <= 0 ? '#757575' : (pct <= 25 ? '#E53935' : (pct <= 50 ? '#FBC02D' : '#66BB6A')));
      html += '<div class="bo-note-hp">';
      html += '<div class="bo-note-hp-bar"><div class="bo-note-hp-fill" style="width:' + pct + '%;background:' + hpColor + '"></div></div>';
      html += '<div class="bo-note-hp-text">' + (curHp !== null ? curHp + '/' + (maxHp || '?') + (tmpHp > 0 ? ' +' + tmpHp : '') : 'HP --') + '</div>';
      html += '</div>';

      // 状态图标
      if (ct && ct.statuses.length > 0) {
        html += '<div class="bo-note-statuses">';
        ct.statuses.forEach(s => {
          const sk = BoardManager.STATUS_KEYS[s.name] || 'custom';
          const durLabel = s.duration ? '<span class="bo-status-dur">' + s.duration + '</span>' : '';
          html += '<div class="bo-turn-status-dot status-' + sk + '" title="' + this._esc(s.name) + (s.duration ? ' (' + s.duration + (s.unit === 'rounds' ? '轮' : '分') + ')' : '') + '">' + this._getStatusEmoji(s.name) + durLabel + '</div>';
        });
        html += '</div>';
      }

      // 完整角色数据块（根据规则书类型分流）
      const d = cd;
      const curSys = SystemManager.getCurrentSystem();
      if ((curSys === 'coc7' || d._coc7) && d.attributes) {
        // COC 7th 战斗便签渲染（匹配原型设计）
        const cocAttrs = d.attributes;
        const cocWeapons = d.weapons || [];
        const cocSkills = d.skills || [];
        const cocInsanity = d.insanityEffects || [];

        // 伤害加值DB计算（基于STR+SIZ总和）
        const strVal = (cocAttrs.str && cocAttrs.str.value) || 0;
        const sizVal = (cocAttrs.siz && cocAttrs.siz.value) || 0;
        const dexVal = (cocAttrs.dex && cocAttrs.dex.value) || 0;
        const strSizTotal = strVal + sizVal;
        let dbStr = '0', buildVal = 0;
        if (strSizTotal <= 64) { dbStr = '-2'; buildVal = -2; }
        else if (strSizTotal <= 84) { dbStr = '-1'; buildVal = -1; }
        else if (strSizTotal <= 124) { dbStr = '0'; buildVal = 0; }
        else if (strSizTotal <= 164) { dbStr = '+1D4'; buildVal = 1; }
        else if (strSizTotal <= 204) { dbStr = '+1D6'; buildVal = 2; }
        else if (strSizTotal <= 284) { dbStr = '+2D6'; buildVal = 3; }
        else if (strSizTotal <= 364) { dbStr = '+3D6'; buildVal = 4; }
        else { dbStr = '+4D6'; buildVal = 5; }

        // 四列战斗数值栏：敏捷(DEX) / 移动 / 护甲 / 伤害加值
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;padding:6px 8px;background:rgba(255,255,255,0.02);">';
        [
          { label: '敏捷', value: dexVal },
          { label: '移动', value: d.mov || 0 },
          { label: '护甲', value: d.armor || 0 },
          { label: '伤害加值', value: dbStr }
        ].forEach(cs => {
          html += '<div style="text-align:center;padding:3px 2px;">';
          html += '<div style="font-size:11px;color:rgba(255,255,255,0.35);">' + cs.label + '</div>';
          html += '<div style="font-size:16px;font-weight:600;color:#e0d8c8;">' + cs.value + '</div>';
          html += '</div>';
        });
        html += '</div>';

        // 战斗技能：显示闪避/格斗(*)/射击(*)/有词缀的模板格斗射击
        const combatSkills = [];
        cocSkills.forEach(sk => {
          const total = (sk.base || 0) + (sk.occ || 0) + (sk.int || 0);
          if (total <= 0) return;
          const nm = sk.name || '';
          const isCombat = nm === '闪避' || nm.startsWith('格斗(') || nm.startsWith('射击(');
          const isTplWithSuffix = sk.suffix && (nm.startsWith('格斗') || nm.startsWith('射击'));
          if (isCombat || isTplWithSuffix) {
            combatSkills.push({ name: _cocSkillDisplayName(sk), total: total });
          }
        });
        if (combatSkills.length > 0) {
          html += '<div style="padding:6px 10px;">';
          html += '<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.5px;margin-bottom:4px;">战斗技能</div>';
          combatSkills.forEach(sk => {
            html += '<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;">';
            html += '<span style="flex:1;color:rgba(255,255,255,0.6);font-weight:500;">' + this._esc(sk.name) + '</span>';
            html += '<span style="font-weight:600;color:#d4a853;font-size:12px;">' + sk.total + '%</span>';
            html += '</div>';
          });
          html += '</div>';
        }

        // 武器
        if (cocWeapons.length > 0) {
          html += '<div style="padding:4px 10px 0;">';
          html += '<div style="font-size:9px;font-weight:600;color:rgba(255,200,100,0.6);letter-spacing:0.5px;margin-bottom:2px;">武器</div>';
          cocWeapons.forEach(w => {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:1px 0;">';
            html += '<span style="font-weight:600;color:#e0d8c8;">' + this._esc(w.name || '') + '</span>';
            if (w.damage) html += '<span style="color:rgba(207,79,79,0.8);font-weight:600;font-size:10px;">' + this._esc(w.damage) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }

        // 理智状态
        html += '<div style="padding:6px 10px 8px;">';
        html += '<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.5px;margin-bottom:4px;">理智状态</div>';
        if (cocInsanity.length > 0) {
          html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
          cocInsanity.forEach(eff => {
            html += '<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(79,127,207,0.1);color:#4f7fcf;">' + this._esc(eff.name) + '</span>';
          });
          html += '</div>';
        } else {
          html += '<div style="font-size:10px;color:rgba(255,255,255,0.25);">理智正常</div>';
        }
        html += '</div>';
      } else if (curSys !== 'dnd5r') {
        const f = d.fields || {};
        const tpl = CharTemplateManager.getTemplate();
        const props = f._props || {};
        const sections = f._sections || {};

        // 属性
        if (tpl.properties.length > 0) {
          html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(48px, 1fr));gap:2px;padding:4px 8px;text-align:center;">';
          tpl.properties.forEach(prop => {
            const val = props[prop.id] || '';
            if (val) {
              html += '<div style="font-size:9px;background:rgba(255,255,255,0.04);border-radius:4px;padding:2px;">';
              html += '<div style="color:rgba(255,255,255,0.25);">' + this._esc(prop.name) + '</div>';
              html += '<div style="color:#e0d8c8;font-weight:600;">' + this._esc(String(val)) + '</div>';
              html += '</div>';
            }
          });
          html += '</div>';
        }
        // 栏位（只显示前2个栏位的前3条）
        let shownSections = 0;
        tpl.sections.forEach(sec => {
          if (shownSections >= 2) return;
          const items = sections[sec.id] || [];
          if (items.length === 0) return;
          shownSections++;
          html += '<div style="padding:4px 10px 0;">';
          html += '<div style="font-size:10px;font-weight:600;color:rgba(255,200,100,0.6);margin-bottom:2px;">' + this._esc(sec.name) + '</div>';
          html += '<div style="font-size:10px;line-height:1.4;">';
          items.slice(0, 3).forEach(it => {
            html += '<div style="color:rgba(255,255,255,0.55);"><span style="font-weight:600;color:#e0d8c8;">' + this._esc(it.name || '') + '</span>';
            if (it.desc) html += ' ' + this._esc(it.desc).substring(0, 20);
            html += '</div>';
          });
          if (items.length > 3) {
            html += '<div style="color:rgba(255,255,255,0.2);">...共 ' + items.length + ' 条</div>';
          }
          html += '</div></div>';
        });
      } else {
        const name = d.name || '';
        const enName = d.enName || '';
        if (name) {
          html += '<div style="padding:4px 10px 0;font-size:12px;font-weight:700;color:#e0d8c8;">' + this._esc(name) + (enName ? ' <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400;">' + this._esc(enName) + '</span>' : '') + '</div>';
        }
        // 体型/类型/阵营
        const sizeType = [d.size, d.type, d.alignment].filter(Boolean).join('，');
        if (sizeType) {
          html += '<div style="padding:2px 10px 0;font-size:10px;color:rgba(255,255,255,0.3);">' + this._esc(sizeType) + '</div>';
        }
        // AC / 先攻 / HP / 速度
        const stats = [];
        if (d.ac) stats.push('AC ' + d.ac);
        if (d.hp) stats.push('HP ' + d.hp);
        if (d.speed) stats.push('速度 ' + d.speed);
        if (stats.length) {
          html += '<div style="padding:3px 10px 0;font-size:10px;color:rgba(255,255,255,0.4);">' + this._esc(stats.join(' · ')) + '</div>';
        }
        // 六项属性
        const abilities = [['力',d.str],['敏',d.dex],['体',d.con],['智',d.int],['感',d.wis],['魅',d.cha]];
        const hasAbilities = abilities.some(a => a[1]);
        if (hasAbilities) {
          html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:2px;padding:4px 8px;text-align:center;">';
          abilities.forEach(([k,v]) => {
            if (v) html += '<div style="font-size:9px;"><div style="color:rgba(255,255,255,0.25);">' + k + '</div><div style="color:#e0d8c8;font-weight:600;">' + this._esc(String(v)) + '</div></div>';
          });
          html += '</div>';
        }
        // 技能/免疫/抗性/感官/语言/CR
        const metaRows = [];
        if (d.skill) metaRows.push(['技能', d.skill]);
        if (d.immune) metaRows.push(['免疫', d.immune]);
        if (d.resistant) metaRows.push(['抗性', d.resistant]);
        if (d.senses) metaRows.push(['感官', d.senses]);
        if (d.languages) metaRows.push(['语言', d.languages]);
        if (d.cr) metaRows.push(['CR', d.cr]);
        metaRows.forEach(([label, val]) => {
          html += '<div style="padding:2px 10px;font-size:10px;line-height:1.4;"><span style="color:rgba(255,255,255,0.25);">' + this._esc(label) + '</span> <span style="color:rgba(255,255,255,0.45);">' + this._esc(String(val)) + '</span></div>';
        });
        // 武器
        const fields = d.fields || {};
        let weapons = [];
        try { weapons = JSON.parse(fields['_weapons'] || '[]'); } catch(e) {}
        if (weapons.length > 0) {
          html += '<div style="padding:4px 10px 0;font-size:10px;font-weight:700;color:rgba(230,126,34,0.6);border-top:1px solid rgba(255,255,255,0.04);margin-top:3px;padding-top:5px;">武器</div>';
          weapons.forEach(w => {
            const parts = [
              '<span style="color:rgba(255,255,255,0.55);font-weight:600;">' + this._esc(w.name || '') + '</span>',
              w.traits ? this._esc(w.traits) : '',
              w.attack ? this._esc(w.attack) : '',
              w.damage ? this._esc(w.damage) : '',
              w.type ? this._esc(w.type) : ''
            ].filter(Boolean).join(' | ');
            html += '<div style="padding:1px 10px;font-size:10px;line-height:1.4;color:rgba(255,255,255,0.4);">' + parts + '</div>';
          });
        }
        // 特质
        if (d.traits && d.traits.length) {
          html += '<div style="padding:4px 10px 0;font-size:10px;font-weight:700;color:rgba(212,168,83,0.6);border-top:1px solid rgba(255,255,255,0.04);margin-top:3px;padding-top:5px;">特质</div>';
          d.traits.forEach(t => {
            html += '<div style="padding:1px 10px;font-size:10px;line-height:1.4;color:rgba(255,255,255,0.4);"><span style="color:rgba(255,255,255,0.55);font-weight:600;">' + this._esc(t.title || '') + '</span> ' + this._esc(t.desc || '') + '</div>';
          });
        }
        // 动作
        if (d.actions && d.actions.length) {
          html += '<div style="padding:4px 10px 0;font-size:10px;font-weight:700;color:rgba(192,112,112,0.6);border-top:1px solid rgba(255,255,255,0.04);margin-top:3px;padding-top:5px;">动作</div>';
          d.actions.forEach(a => {
            html += '<div style="padding:1px 10px;font-size:10px;line-height:1.4;color:rgba(255,255,255,0.4);"><span style="color:rgba(255,255,255,0.55);font-weight:600;">' + this._esc(a.title || '') + '</span> ' + this._esc(a.desc || '') + '</div>';
          });
        }
        // 其他
        if (d.other) {
          html += '<div style="padding:4px 10px 0;font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);border-top:1px solid rgba(255,255,255,0.04);margin-top:3px;padding-top:5px;">其他</div>';
          html += '<div style="padding:1px 10px 4px;font-size:10px;line-height:1.4;color:rgba(255,255,255,0.35);white-space:pre-wrap;">' + this._esc(d.other) + '</div>';
        }
      }

      el.innerHTML = html;

      // 尺寸调节手柄
      const pResizeHandle = document.createElement('div');
      pResizeHandle.className = 'bo-resize-handle';
      pResizeHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        BoardManager._boStartResize(e, p.id, 'participant');
      });
      el.appendChild(pResizeHandle);

      // 滚轮事件隔离：悬停便签时滚轮只滚动便签内容，不滚动画布镜头
      el.addEventListener('wheel', (e) => {
        if (el.scrollHeight > el.clientHeight) {
          e.stopPropagation();
        }
      }, { passive: true });

      // 拖拽（仅从header区域发起，避免与内容滚动冲突）
      el.addEventListener('mousedown', (e) => {
        // 连线模式：在卡片任意位置点击均可选中为连线起点/终点
        if (this._boWaitForConnectSource) {
          e.stopPropagation();
          this._boWaitForConnectSource = false;
          this._boStartConnection(p.id);
          return;
        }
        if (this._boIsConnecting) {
          e.stopPropagation();
          if (this._boConnectSourcePid !== p.id) {
            this._boCompleteConnection(p.id);
          }
          return;
        }
        // 擦除模式：不做任何操作
        if (this._boIsErasingConnections) return;
        if (e.target.closest('.bo-turn-env-btn')) return;
        if (!e.target.closest('.note-header')) return;
        e.stopPropagation();
        this._boIsDragging = true;
        this._boHideQuickView();
        const startX = e.clientX, startY = e.clientY;
        const origX = p.x || 100, origY = p.y || 100;
        const s = this._boCanvasState.scale;
        const draggedW = 280; // 战斗卡片固定宽度
        const onMove = (ev) => {
          p.x = origX + (ev.clientX - startX) / s;
          p.y = origY + (ev.clientY - startY) / s;
          // 吸附对齐：检查与其他战斗卡片的边缘距离
          const draggedH = el.offsetHeight || 300;
          const threshold = 8; // 虚拟像素
          const cards = canvas.querySelectorAll('.bo-canvas-note');
          for (const card of cards) {
            if (card === el) continue;
            const ox = parseFloat(card.style.left) || 0;
            const oy = parseFloat(card.style.top) || 0;
            const ow = 280;
            const oh = card.offsetHeight || 300;
            // 水平吸附
            const hChecks = [
              { de: p.x, te: ox },
              { de: p.x, te: ox + ow },
              { de: p.x + draggedW, te: ox },
              { de: p.x + draggedW, te: ox + ow },
              { de: p.x + draggedW / 2, te: ox + ow / 2 }
            ];
            for (const { de, te } of hChecks) {
              if (Math.abs(de - te) < threshold) {
                p.x = te - (de - p.x);
                break;
              }
            }
            // 垂直吸附
            const vChecks = [
              { de: p.y, te: oy },
              { de: p.y, te: oy + oh },
              { de: p.y + draggedH, te: oy },
              { de: p.y + draggedH, te: oy + oh },
              { de: p.y + draggedH / 2, te: oy + oh / 2 }
            ];
            for (const { de, te } of vChecks) {
              if (Math.abs(de - te) < threshold) {
                p.y = te - (de - p.y);
                break;
              }
            }
          }
          el.style.left = p.x + 'px';
          el.style.top = p.y + 'px';
          this._boRenderConnections();
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this._boIsDragging = false;
          this._boRenderMinimap();
          StorageManager.scheduleSave();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // 点击选择目标
      el.addEventListener('click', (e) => {
        // 连线/擦除模式不处理目标选择
        if (this._boIsConnecting || this._boWaitForConnectSource || this._boIsErasingConnections) return;
        if (this._boTargetMode) {
          e.stopPropagation();
          const idx = this._boSelectedTargets.indexOf(p.id);
          if (idx >= 0) this._boSelectedTargets.splice(idx, 1);
          else this._boSelectedTargets.push(p.id);
          this._boUpdateConfirmBtn();
          this._boUpdateArrowOverlay();
          this._boRenderTurnList();
          this._boRenderCanvasNotes();
        }
      });

      // 右键：连线/擦除模式下退出，目标模式下取消，否则显示上下文菜单
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._boIsConnecting || this._boWaitForConnectSource) {
          this._boExitConnectMode();
          return;
        }
        if (this._boIsErasingConnections) {
          this._boExitEraseMode();
          return;
        }
        if (this._boTargetMode) {
          this._boCancelTargetMode();
          return;
        }
        if (this._boDeleteMode) return;
        this._boCtxNotePid = p.id;
        this._boShowCanvasCtxMenu(e.clientX, e.clientY);
      });

      // 悬停显示速览卡（拖拽时不显示；COC角色不显示）
      el.addEventListener('mouseenter', (e) => {
        if (this._boIsDragging) return;
        if (cd && cd._coc7) return;
        this._boShowQuickView(e, p.id);
      });
      el.addEventListener('mouseleave', () => {
        this._boHideQuickView();
      });

      // 双击打开角色图鉴页
      el.addEventListener('dblclick', () => {
        UIRender.switchPage('characters');
        CharAlbum.selectCharacter(p.sourceNoteId || p.id);
      });

      canvas.appendChild(el);
    });

    // 渲染纯文本和文字元素
    if (battle.canvas.notes) {
      battle.canvas.notes.forEach(note => {
        if (note.type === 'plaintext') {
          const el = document.createElement('div');
          el.className = 'bo-canvas-note';
          el.setAttribute('data-note-id', note.id);
          el.dataset.type = 'plaintext';
          const s = note.style || {};
          const fs = s.fontSize || 14;
          const opacity = s.opacity !== undefined ? s.opacity : 1;
          let borderStyle = '1px solid rgba(255,255,255,0.15)';
          if (s.border === 'dashed') borderStyle = '1px dashed rgba(255,255,255,0.15)';
          else if (s.border === 'none') borderStyle = 'none';
          let bgColor = s.bgColor || '#1e1c18';
          el.style.cssText = 'position:absolute;left:' + note.x + 'px;top:' + note.y + 'px;width:' + (note.width || 300) + 'px;height:' + (note.height || 120) + 'px;font-size:' + fs + 'px;color:' + (s.color || 'var(--text)') + ';background:' + bgColor + ';border:' + borderStyle + ';border-radius:6px;padding:8px 10px;white-space:pre-wrap;overflow-y:auto;text-align:' + (s.align || 'left') + ';opacity:' + opacity + ';z-index:1;font-weight:' + (s.bold ? '700' : '400') + ';font-style:' + (s.italic ? 'italic' : 'normal') + ';text-decoration:' + (s.underline ? 'underline' : 'none') + ';scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;';
          el.textContent = note.content || '';
          // 尺寸调节手柄
          const ptResizeHandle = document.createElement('div');
          ptResizeHandle.className = 'bo-resize-handle';
          ptResizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            BoardManager._boStartResize(e, note.id, 'note');
          });
          el.appendChild(ptResizeHandle);
          el.addEventListener('dblclick', () => { this._boEditPlainText(note.id); });
          el.addEventListener('mousedown', (e) => {
            if (this._boWaitForConnectSource) {
              e.stopPropagation();
              this._boWaitForConnectSource = false;
              this._boStartConnection(note.id);
              return;
            }
            if (this._boIsConnecting && this._boConnectSourcePid !== note.id) {
              e.stopPropagation();
              this._boCompleteConnection(note.id);
              return;
            }
            if (this._boIsErasingConnections) return;
            this._boStartPlainTextDrag(e, note.id);
          });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._boIsConnecting || this._boWaitForConnectSource) { this._boExitConnectMode(); return; }
            if (this._boIsErasingConnections) { this._boExitEraseMode(); return; }
            this._boShowNoteCtxMenu(e.clientX, e.clientY, note.id, 'plaintext');
          });
          el.addEventListener('wheel', (e) => { if (el.scrollHeight > el.clientHeight) e.stopPropagation(); }, { passive: true });
          canvas.appendChild(el);
        } else if (note.type === 'text') {
          const el = document.createElement('div');
          el.className = 'bo-canvas-text-el';
          el.setAttribute('data-note-id', note.id);
          el.dataset.type = 'text';
          el.style.cssText = 'position:absolute;left:' + note.x + 'px;top:' + note.y + 'px;width:' + (note.width || 100) + 'px;height:' + (note.height || 24) + 'px;font-size:' + (note.fontSize || 16) + 'px;color:' + (note.color || '#e0d8c8') + ';white-space:nowrap;z-index:1;font-weight:' + (note.bold ? '700' : '400') + ';font-style:' + (note.italic ? 'italic' : 'normal') + ';display:flex;align-items:center;justify-content:center;';
          el.textContent = note.content || '';
          el.addEventListener('dblclick', () => { this._boEditTextElement(note.id); });
          el.addEventListener('mousedown', (e) => {
            if (this._boWaitForConnectSource) {
              e.stopPropagation();
              this._boWaitForConnectSource = false;
              this._boStartConnection(note.id);
              return;
            }
            if (this._boIsConnecting && this._boConnectSourcePid !== note.id) {
              e.stopPropagation();
              this._boCompleteConnection(note.id);
              return;
            }
            if (this._boIsErasingConnections) return;
            this._boStartPlainTextDrag(e, note.id);
          });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._boIsConnecting || this._boWaitForConnectSource) { this._boExitConnectMode(); return; }
            if (this._boIsErasingConnections) { this._boExitEraseMode(); return; }
            this._boShowNoteCtxMenu(e.clientX, e.clientY, note.id, 'text');
          });
          canvas.appendChild(el);
        }
      });
    }
  },

  /* ---------- 画布右键菜单 ---------- */
  _boShowCanvasCtxMenu(screenX, screenY) {
    const menu = document.getElementById('boCanvasCtxMenu');
    if (!menu) return;
    const area = document.getElementById('boCanvasArea');
    const areaRect = area.getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.left = (screenX - areaRect.left) + 'px';
    menu.style.top = (screenY - areaRect.top) + 'px';
    // 点击其他区域关闭
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._boHideCanvasCtxMenu();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  },

  _boHideCanvasCtxMenu() {
    const menu = document.getElementById('boCanvasCtxMenu');
    if (menu) menu.style.display = 'none';
    this._boCtxNotePid = null;
    this._boHideBgFrameCtxMenu();
  },

  /* ===== 纯文本/文字元素右键菜单 ===== */
  _boShowNoteCtxMenu(screenX, screenY, noteId, noteType) {
    this._boHideNoteCtxMenu();
    const menu = document.getElementById('boNoteCtxMenu');
    if (!menu) return;
    const area = document.getElementById('boCanvasArea');
    const areaRect = area.getBoundingClientRect();
    // 根据类型切换标签文案
    const editLabel = document.getElementById('boNoteCtxEditLabel');
    const deleteLabel = document.getElementById('boNoteCtxDeleteLabel');
    if (noteType === 'plaintext') {
      if (editLabel) editLabel.textContent = '编辑纯文本';
      if (deleteLabel) deleteLabel.textContent = '删除纯文本';
    } else {
      if (editLabel) editLabel.textContent = '编辑文字';
      if (deleteLabel) deleteLabel.textContent = '删除文字';
    }
    // 绑定操作
    const editBtn = document.getElementById('boNoteCtxEditBtn');
    const deleteBtn = document.getElementById('boNoteCtxDeleteBtn');
    const oldEdit = editBtn._onclick;
    const oldDelete = deleteBtn._onclick;
    if (oldEdit) editBtn.removeEventListener('click', oldEdit);
    if (oldDelete) deleteBtn.removeEventListener('click', oldDelete);
    const editHandler = () => {
      this._boHideNoteCtxMenu();
      if (noteType === 'plaintext') this._boEditPlainText(noteId);
      else this._boEditTextElement(noteId);
    };
    const deleteHandler = () => {
      this._boHideNoteCtxMenu();
      this._boDeleteCanvasNote(noteId);
    };
    editBtn._onclick = editHandler;
    deleteBtn._onclick = deleteHandler;
    editBtn.addEventListener('click', editHandler);
    deleteBtn.addEventListener('click', deleteHandler);

    menu.style.display = 'block';
    menu.style.left = (screenX - areaRect.left) + 'px';
    menu.style.top = (screenY - areaRect.top) + 'px';
    // 点击其他区域关闭
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._boHideNoteCtxMenu();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  },

  _boHideNoteCtxMenu() {
    const menu = document.getElementById('boNoteCtxMenu');
    if (menu) menu.style.display = 'none';
  },

  _boCtxEditNote() {
    const pid = this._boCtxNotePid;
    this._boHideCanvasCtxMenu();
    if (!pid) return;
    this._boOpenEditModal(pid);
  },

  _boOpenEditModal(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    const ct = this._getCombatTracker(p);

    // 构建状态列表HTML
    let statusHtml = '';
    if (ct && ct.statuses && ct.statuses.length > 0) {
      ct.statuses.forEach((s, i) => {
        const sName = typeof s === 'string' ? s : (s.name || '');
        const sDur = typeof s === 'object' ? (s.duration || '') : '';
        statusHtml += '<div class="bo-edit-status-row" data-idx="' + i + '">'
          + '<input type="text" class="bo-edit-status-name" value="' + this._esc(sName) + '" placeholder="状态名称">'
          + '<input type="text" class="bo-edit-status-dur" value="' + this._esc(String(sDur)) + '" placeholder="轮数">'
          + '<button class="bo-edit-status-del" onclick="BoardManager._boEditRemoveStatus(' + i + ')">&times;</button>'
          + '</div>';
      });
    }

    const html = '<div class="bo-edit-modal" id="boEditModal" onclick="if(event.target===this)BoardManager._boCloseEditModal()">'
      + '<div class="bo-edit-box">'
      + '<div class="bo-edit-header">'
      + '<span class="bo-edit-title">编辑参与者</span>'
      + '<button class="bo-edit-close" onclick="BoardManager._boCloseEditModal()">&times;</button>'
      + '</div>'
      + '<div class="bo-edit-body">'
      // === 基本信息 ===
      + '<div class="bo-edit-section">'
      + '<div class="bo-edit-section-title">基本信息</div>'
      + '<div class="bo-edit-row">'
      + '<div class="bo-edit-field w2"><label>名称</label><input id="boEdName" value="' + this._esc(p.instanceName || '') + '"></div>'
      + '<div class="bo-edit-field"><label>角色分类</label><select id="boEdFaction">'
      + '<option value="pc"' + (p.faction === 'pc' ? ' selected' : '') + '>玩家角色</option>'
      + '<option value="friendly_npc"' + (p.faction === 'friendly_npc' ? ' selected' : '') + '>友方NPC</option>'
      + '<option value="enemy_npc"' + (p.faction === 'enemy_npc' ? ' selected' : '') + '>敌方NPC</option>'
      + '</select></div>'
      + '<div class="bo-edit-field"><label>先攻</label><input id="boEdInit" type="number" value="' + (p.initiative != null ? p.initiative : '') + '"></div>'
      + '</div>'
      + '</div>'
      // === 战斗数据 ===
      + '<div class="bo-edit-section">'
      + '<div class="bo-edit-section-title">战斗数据</div>'
      + '<div class="bo-edit-row">'
      + '<div class="bo-edit-field"><label>当前HP</label><input id="boEdCurHp" type="number" value="' + (ct ? ct.currentHp : '') + '"></div>'
      + '<div class="bo-edit-field"><label>最大HP</label><input id="boEdMaxHp" type="number" value="' + (ct ? (ct.maxHp || '') : '') + '"></div>'
      + '<div class="bo-edit-field"><label>临时HP</label><input id="boEdTmpHp" type="number" value="' + (ct ? (ct.tempHp || 0) : 0) + '"></div>'
      + '</div>'
      + '</div>'
      // === 状态效果 ===
      + '<div class="bo-edit-section">'
      + '<div class="bo-edit-section-title">状态效果 <span class="bo-edit-hint">（角色属性请在角色图鉴中编辑）</span></div>'
      + '<div class="bo-edit-status-list" id="boEditStatusList">'
      + statusHtml
      + '</div>'
      + '<button class="bo-edit-status-add" onclick="BoardManager._boEditAddStatus()">+ 添加状态</button>'
      + '</div>'
      + '</div>' // end bo-edit-body
      + '<div class="bo-edit-footer">'
      + '<button class="bo-edit-btn cancel" onclick="BoardManager._boCloseEditModal()">取消</button>'
      + '<button class="bo-edit-btn confirm" onclick="BoardManager._boSaveEditModal(\'' + pid + '\')">保存</button>'
      + '</div>'
      + '</div>' // end bo-edit-box
      + '</div>'; // end bo-edit-modal

    // 移除已有弹窗
    this._boCloseEditModal();
    document.body.insertAdjacentHTML('beforeend', html);
  },

  _boCloseEditModal() {
    const m = document.getElementById('boEditModal');
    if (m) m.remove();
  },

  _boEditAddStatus() {
    const list = document.getElementById('boEditStatusList');
    if (!list) return;
    const idx = list.children.length;
    const row = document.createElement('div');
    row.className = 'bo-edit-status-row';
    row.dataset.idx = idx;
    row.innerHTML = '<input type="text" class="bo-edit-status-name" value="" placeholder="状态名称">'
      + '<input type="text" class="bo-edit-status-dur" value="" placeholder="轮数">'
      + '<button class="bo-edit-status-del" onclick="BoardManager._boEditRemoveStatus(' + idx + ')">&times;</button>';
    list.appendChild(row);
  },

  _boEditRemoveStatus(idx) {
    const list = document.getElementById('boEditStatusList');
    if (!list) return;
    const rows = list.querySelectorAll('.bo-edit-status-row');
    if (rows[idx]) rows[idx].remove();
  },

  _boEditAddArrayItem(section) {
    const listId = section === 'traits' ? 'boEditTraitsList' : 'boEditActionsList';
    const list = document.getElementById(listId);
    if (!list) return;
    const idx = list.children.length;
    const titleClass = section === 'traits' ? 'bo-edit-trait-title' : 'bo-edit-action-title';
    const descClass = section === 'traits' ? 'bo-edit-trait-desc' : 'bo-edit-action-desc';
    const row = document.createElement('div');
    row.className = 'bo-edit-array-row';
    row.dataset.idx = idx;
    row.innerHTML = '<input type="text" class="title-input ' + titleClass + '" value="" placeholder="' + (section === 'traits' ? '特质名' : '动作名') + '">'
      + '<input type="text" class="desc-input ' + descClass + '" value="" placeholder="描述">'
      + '<button class="bo-edit-status-del" onclick="BoardManager._boEditRemoveArrayItem(\'' + section + '\',' + idx + ')">&times;</button>';
    list.appendChild(row);
  },

  _boEditRemoveArrayItem(section, idx) {
    const listId = section === 'traits' ? 'boEditTraitsList' : 'boEditActionsList';
    const list = document.getElementById(listId);
    if (!list) return;
    const rows = list.querySelectorAll('.bo-edit-array-row');
    if (rows[idx]) rows[idx].remove();
  },

  _boSaveEditModal(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    const ct = this._getCombatTracker(p);

    // 保存参与者级别字段
    p.instanceName = document.getElementById('boEdName').value.trim() || p.instanceName;
    p.faction = document.getElementById('boEdFaction').value;
    const initVal = document.getElementById('boEdInit').value;
    p.initiative = initVal !== '' ? parseInt(initVal, 10) : null;

    // 保存战斗数据
    if (ct) {
      const curHpVal = document.getElementById('boEdCurHp').value;
      ct.currentHp = curHpVal !== '' ? parseInt(curHpVal, 10) : ct.currentHp;
      const maxHpVal = document.getElementById('boEdMaxHp').value;
      ct.maxHp = maxHpVal !== '' ? parseInt(maxHpVal, 10) : ct.maxHp;
      const tmpHpVal = document.getElementById('boEdTmpHp').value;
      ct.tempHp = tmpHpVal !== '' ? parseInt(tmpHpVal, 10) : 0;

      // 保存状态（同名叠加）
      const statusRows = document.querySelectorAll('#boEditStatusList .bo-edit-status-row');
      ct.statuses = [];
      const statusMap = {};
      statusRows.forEach(row => {
        const name = row.querySelector('.bo-edit-status-name').value.trim();
        const durStr = row.querySelector('.bo-edit-status-dur').value.trim();
        if (name) {
          const dur = durStr !== '' ? parseInt(durStr, 10) : null;
          if (statusMap[name]) {
            if (statusMap[name].duration === null || dur === null) {
              statusMap[name].duration = null;
            } else {
              statusMap[name].duration += dur;
            }
          } else {
            statusMap[name] = { name: name, duration: dur };
          }
        }
      });
      ct.statuses = Object.values(statusMap);
    }

    this._boCloseEditModal();
    this._boRenderAll();
    StorageManager.scheduleSave();
  },

  _boCtxDeleteNote() {
    const pid = this._boCtxNotePid;
    this._boHideCanvasCtxMenu();
    if (!pid) return;
    this._boRemoveParticipant(pid);
    this._boRenderAll();
    StorageManager.scheduleSave();
  },

  /* ---------- 鸟瞰图小地图 ---------- */
  _boRenderMinimap() {
    const canvas = document.getElementById('boMinimapCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const battle = this._getCurrentBattle();
    if (!battle || battle.participants.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // 计算所有便签的边界
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    battle.participants.forEach(p => {
      const px = p.x || 100, py = p.y || 100;
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + 280);
      maxY = Math.max(maxY, py + 160);
    });
    // 触发器也纳入边界
    if (battle.triggers) {
      battle.triggers.forEach(tr => {
        if (tr.canvasNote) {
          minX = Math.min(minX, tr.canvasNote.x || 100);
          minY = Math.min(minY, tr.canvasNote.y || 100);
          maxX = Math.max(maxX, (tr.canvasNote.x || 100) + 200);
          maxY = Math.max(maxY, (tr.canvasNote.y || 100) + 100);
        }
      });
    }
    // 确保最小世界范围（避免内容太大）
    const minRange = 800;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    if (maxX - minX < minRange) { minX = cx - minRange / 2; maxX = cx + minRange / 2; }
    if (maxY - minY < minRange) { minY = cy - minRange / 2; maxY = cy + minRange / 2; }
    // 添加边距
    const pad = 200;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;
    const scale = Math.min(W / worldW, H / worldH);

    // 存储映射参数供点击使用
    this._boMinimapScale = scale;
    this._boMinimapOffset = { x: minX, y: minY };
    this._boMinimapCanvasSize = { w: W, h: H };

    // 绘制便签
    battle.participants.forEach(p => {
      const px = ((p.x || 100) - minX) * scale;
      const py = ((p.y || 100) - minY) * scale;
      const pw = 280 * scale;
      const ph = 160 * scale;
      const faction = p.faction || 'enemy_npc';
      if (faction === 'pc') ctx.fillStyle = 'rgba(90,154,90,0.5)';
      else if (faction === 'enemy_npc') ctx.fillStyle = 'rgba(192,112,112,0.5)';
      else ctx.fillStyle = 'rgba(150,150,130,0.4)';
      ctx.fillRect(px, py, Math.max(pw, 2), Math.max(ph, 2));
    });

    // 绘制触发器便签
    if (battle.triggers) {
      battle.triggers.forEach(tr => {
        if (tr.canvasNote) {
          const px = ((tr.canvasNote.x || 100) - minX) * scale;
          const py = ((tr.canvasNote.y || 100) - minY) * scale;
          ctx.fillStyle = 'rgba(212,168,83,0.4)';
          ctx.fillRect(px, py, Math.max(200 * scale, 2), Math.max(80 * scale, 2));
        }
      });
    }

    // 更新视口指示器
    this._boUpdateMinimapViewport(scale, minX, minY, W, H);
  },

  _boUpdateMinimapViewport(mmScale, minX, minY, canvasW, canvasH) {
    const vpEl = document.getElementById('boMinimapViewport');
    if (!vpEl) return;
    const area = document.getElementById('boCanvasArea');
    const cs = this._boCanvasState;
    if (!area || !cs) return;

    const areaW = area.clientWidth;
    const areaH = area.clientHeight;
    // 视口在虚拟坐标中的位置和大小
    const vpLeft = cs.x;
    const vpTop = cs.y;
    const vpWidth = areaW / cs.scale;
    const vpHeight = areaH / cs.scale;

    const left = (vpLeft - minX) * mmScale;
    const top = (vpTop - minY) * mmScale;
    const width = vpWidth * mmScale;
    const height = vpHeight * mmScale;

    vpEl.style.left = Math.max(0, left) + 'px';
    vpEl.style.top = Math.max(0, top) + 'px';
    vpEl.style.width = Math.min(width, canvasW) + 'px';
    vpEl.style.height = Math.min(height, canvasH) + 'px';
  },

  _boOnMinimapClick(e) {
    const canvas = document.getElementById('boMinimapCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (!this._boMinimapScale || !this._boMinimapOffset) return;
    const mmS = this._boMinimapScale;
    const off = this._boMinimapOffset;

    // 将点击位置转换为虚拟坐标
    const virtualX = clickX / mmS + off.x;
    const virtualY = clickY / mmS + off.y;

    // 将视口居中到该位置
    const area = document.getElementById('boCanvasArea');
    if (!area) return;
    const cs = this._boCanvasState;
    cs.x = virtualX - (area.clientWidth / cs.scale) / 2;
    cs.y = virtualY - (area.clientHeight / cs.scale) / 2;
    this._boUpdateCanvasTransform();
    this._boRenderMinimap();
    // 保存视口
    const battle = this._getCurrentBattle();
    if (battle) {
      battle.canvas.viewport.x = cs.x;
      battle.canvas.viewport.y = cs.y;
    }
  },

  /* ---------- 框选多选 ---------- */
  _boStartBoxSelect(e) {
    const area = document.getElementById('boCanvasArea');
    const areaRect = area.getBoundingClientRect();
    this._boBoxSelect = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      areaLeft: areaRect.left,
      areaTop: areaRect.top
    };
    const selRect = document.getElementById('boSelectRect');
    if (selRect) {
      selRect.style.display = 'block';
      selRect.style.left = (e.clientX - areaRect.left) + 'px';
      selRect.style.top = (e.clientY - areaRect.top) + 'px';
      selRect.style.width = '0px';
      selRect.style.height = '0px';
    }
  },

  _boUpdateBoxSelect(e) {
    if (!this._boBoxSelect || !this._boBoxSelect.active) return;
    const bs = this._boBoxSelect;
    const selRect = document.getElementById('boSelectRect');
    if (!selRect) return;
    const x1 = bs.startX - bs.areaLeft;
    const y1 = bs.startY - bs.areaTop;
    const x2 = e.clientX - bs.areaLeft;
    const y2 = e.clientY - bs.areaTop;
    selRect.style.left = Math.min(x1, x2) + 'px';
    selRect.style.top = Math.min(y1, y2) + 'px';
    selRect.style.width = Math.abs(x2 - x1) + 'px';
    selRect.style.height = Math.abs(y2 - y1) + 'px';
  },

  _boEndBoxSelect(e) {
    if (!this._boBoxSelect || !this._boBoxSelect.active) return;
    const bs = this._boBoxSelect;
    const selRect = document.getElementById('boSelectRect');
    if (selRect) selRect.style.display = 'none';

    // 计算框选范围（屏幕坐标 → 虚拟坐标）
    const cs = this._boCanvasState;
    const x1 = Math.min(bs.startX, e.clientX) - bs.areaLeft;
    const y1 = Math.min(bs.startY, e.clientY) - bs.areaTop;
    const x2 = Math.max(bs.startX, e.clientX) - bs.areaLeft;
    const y2 = Math.max(bs.startY, e.clientY) - bs.areaTop;

    // 仅当拖拽距离足够大时才视为框选
    if (Math.abs(e.clientX - bs.startX) > 5 && Math.abs(e.clientY - bs.startY) > 5) {
      // 转换为虚拟坐标
      const vx1 = x1 / cs.scale + cs.x;
      const vy1 = y1 / cs.scale + cs.y;
      const vx2 = x2 / cs.scale + cs.x;
      const vy2 = y2 / cs.scale + cs.y;

      // 查找范围内的便签
      const battle = this._getCurrentBattle();
      if (battle) {
        const selected = [];
        battle.participants.forEach(p => {
          const px = p.x || 100, py = p.y || 100;
          const pw = 220, ph = 120;
          // 检查便签矩形是否与框选矩形相交
          if (px < vx2 && px + pw > vx1 && py < vy2 && py + ph > vy1) {
            selected.push(p.id);
          }
        });
        // 如果框选时按住 Ctrl，追加到目标选择
        if (this._boTargetMode && e.ctrlKey) {
          selected.forEach(id => {
            if (!this._boSelectedTargets.includes(id)) {
              this._boSelectedTargets.push(id);
            }
          });
        } else if (this._boTargetMode) {
          // 替换目标选择
          this._boSelectedTargets = selected;
        } else if (selected.length > 0) {
          // 非目标模式下：进入目标模式并选中
          // 不自动进入目标模式，只高亮显示
        }
        this._boUpdateConfirmBtn();
        this._boUpdateArrowOverlay();
        this._boRenderTurnList();
        this._boRenderCanvasNotes();
      }
    }

    this._boBoxSelect = null;
  },

  /* ---------- 触发器便签在画布上显示 ---------- */
  _boRenderTriggerNotes() {
    const canvas = document.getElementById('boCanvas');
    if (!canvas) return;
    const battle = this._getCurrentBattle();
    if (!battle || !battle.triggers) return;

    // 清除旧的触发器便签
    canvas.querySelectorAll('.bo-canvas-trigger-note').forEach(el => el.remove());

    battle.triggers.forEach((tr, idx) => {
      if (!tr.canvasNote) return;
      const el = document.createElement('div');
      el.className = 'bo-canvas-note bo-canvas-trigger-note';
      el.setAttribute('data-trigger-idx', idx);
      el.style.left = (tr.canvasNote.x || 100) + 'px';
      el.style.top = (tr.canvasNote.y || 100) + 'px';
      el.style.width = '200px';
      el.style.borderColor = 'rgba(212,168,83,0.3)';

      let html = '<div class="note-header">';
      html += '<span class="type-badge" style="background:rgba(212,168,83,0.15);color:#d4a853;">触发器</span>';
      html += '<span class="note-title">' + this._esc(tr.message || '触发器') + '</span>';
      html += '</div>';
      var condDesc = this._boDescribeTrigger(tr);
      if (condDesc) {
        html += '<div style="padding:6px 10px;font-size:10px;color:rgba(255,255,255,0.4);">' + this._esc(condDesc) + '</div>';
      }
      if (tr.isTriggered) {
        el.classList.add('triggered');
      }
      el.innerHTML = html;

      // 拖拽
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const origX = tr.canvasNote.x || 100, origY = tr.canvasNote.y || 100;
        const s = this._boCanvasState.scale;
        const onMove = (ev) => {
          tr.canvasNote.x = origX + (ev.clientX - startX) / s;
          tr.canvasNote.y = origY + (ev.clientY - startY) / s;
          el.style.left = tr.canvasNote.x + 'px';
          el.style.top = tr.canvasNote.y + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this._boRenderMinimap();
          StorageManager.scheduleSave();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      canvas.appendChild(el);
    });
  },

  /* ---------- 世界时钟时间获取 ---------- */
  _getWorldClockTime() {
    const wt = AppState.currentModule.board.worldTime;
    if (!wt) return '';
    const h = Math.floor(wt.time / 60);
    const m = wt.time % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },

  /* ---------- 模板导出 ---------- */
  exportBattleTemplate() {
    const battle = this._getCurrentBattle();
    if (!battle) return;

    const template = {
      formatVersion: '1.0',
      moduleType: 'battle-deployment',
      createdAt: new Date().toISOString(),
      name: battle.name,
      participants: battle.participants.map(p => ({
        instanceName: p.instanceName,
        faction: p.faction,
        environment: p.environment,
        sourceCharacterData: null
      })),
      triggers: battle.triggers.map(t => ({ type: t.type, condition: t.condition, message: t.message })),
      battlefieldNotes: { ...battle.battlefieldNotes }
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = battle.name + '.battle';
    a.click();
    URL.revokeObjectURL(url);
  },

  /* ---------- 模板导入 ---------- */
  importBattleTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.battle,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const tpl = JSON.parse(reader.result);
          if (tpl.moduleType !== 'battle-deployment') {
            alert('无效的战斗部署模板文件');
            return;
          }
          const name = tpl.name || '导入的战斗';
          if (!confirm('将导入战斗部署「' + name + '」\n包含 ' + (tpl.participants || []).length + ' 名参战人员。\n\n确定导入？')) return;

          const board = AppState.currentModule.board;
          if (!board.battleDeployments) board.battleDeployments = [];
          const newBattle = {
            id: 'battle_' + Date.now(),
            name: name,
            participants: (tpl.participants || []).map((tp, i) => ({
              id: 'p_' + Date.now() + '_' + i,
              instanceName: tp.instanceName || '未知',
              faction: tp.faction || 'enemy_npc',
              initiative: null,
              isDelayed: false,
              isReady: false,
              environment: tp.environment || { terrain: 'normal', cover: 'none', lighting: 'bright' },
              x: 100 + (i % 4) * 250,
              y: 100 + Math.floor(i / 4) * 200,
              sourceNoteId: null,
              resourceNotes: ''
            })),
            turnTracker: { orderedIds: [], isActive: false, currentIndex: 0, currentRound: 0 },
            triggers: (tpl.triggers || []).map((t, i) => ({
              id: 'trig_' + Date.now() + '_' + i,
              type: t.type || 'round',
              condition: t.condition || '',
              message: t.message || '',
              triggered: false,
              acknowledged: false
            })),
            battlefieldNotes: tpl.battlefieldNotes || {},
            combatLog: [],
            statistics: { totalDamage: 0, totalHealing: 0, totalRounds: 0, nearDeathEvents: [], statusEvents: [] },
            canvas: { viewport: { x: 0, y: 0, scale: 1 } }
          };
          newBattle.turnTracker.orderedIds = newBattle.participants.map(p => p.id);
          board.battleDeployments.push(newBattle);
          StorageManager.scheduleSave();
          this.renderUnitNotes();
          alert('导入成功！');
        } catch (e) {
          alert('解析模板文件失败：' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  /* ---------- 辅助：解析最大HP ---------- */
  _parseMaxHp(characterData) {
    if (!characterData) return null;
    // COC格式：hp = {current, max}
    if (characterData.hp && typeof characterData.hp === 'object' && characterData.hp.max != null) {
      return characterData.hp.max;
    }
    let hpVal = characterData.hp;
    if (!hpVal && characterData.fields && characterData.fields._hp) hpVal = characterData.fields._hp;
    if (!hpVal && characterData.fields && characterData.fields['HP']) hpVal = characterData.fields['HP'];
    if (!hpVal) return null;
    const m = String(hpVal).match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  },

  /* ---------- 角色速览卡 ---------- */
  _boShowQuickView(e, pid) {
    if (this._boIsResizing) return;
    const p = this._getParticipant(this._getCurrentBattle(), pid);
    if (!p) return;
    
    const cd = this._getParticipantCharData(p);
    if (!cd) return;
    
    // 兼容扁平字段和 fields 子对象
    const f = cd.fields || {};
    const g = (fieldKey, flatKey) => {
      if (f[fieldKey] !== undefined && f[fieldKey] !== '') return f[fieldKey];
      return cd[flatKey] !== undefined ? cd[flatKey] : '';
    };
    const flatKeys = {
      'AC': 'ac', '护甲等级': 'ac',
      '先攻': 'initiative',
      '速度': 'speed',
      '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha'
    };
    
    const dexVal = parseInt(g('敏捷', 'dex')) || 10;
    const dexMod = Math.floor((dexVal - 10) / 2);
    const dexModStr = dexMod >= 0 ? '+' + dexMod : String(dexMod);
    
    let qv = document.getElementById('charQuickView');
    if (!qv) {
      qv = document.createElement('div');
      qv.id = 'charQuickView';
      qv.className = 'char-quick-view';
      document.body.appendChild(qv);
    }
    
    let html = '<div class="cqv-header">';
    html += `<div class="cqv-icon">${(cd.name || p.instanceName || '?').charAt(0)}</div>`;
    html += '<div class="cqv-title-wrap">';
    html += `<div class="cqv-name">${this._esc(cd.name || p.instanceName || '未命名')}</div>`;
    html += `<div class="cqv-faction">${p.faction === 'pc' ? '玩家角色' : p.faction === 'enemy_npc' ? '敌方NPC' : '友方NPC'}</div>`;
    html += '</div></div>';
    
    html += '<div class="cqv-stats">';
    if (cd._coc7 && cd.attributes) {
      // COC 速览：HP / SAN / LUCK / MP
      const cocHp = cd.hp || {};
      const cocSan = cd.san || {};
      const cocLuck = cd.luck || {};
      const cocMp = cd.mp || {};
      html += `<div class="cqv-stat"><span class="cqv-stat-label">HP</span><span class="cqv-stat-value cqv-hp">${cocHp.current != null ? cocHp.current : '--'}/${cocHp.max != null ? cocHp.max : '--'}</span></div>`;
      html += `<div class="cqv-stat"><span class="cqv-stat-label">SAN</span><span class="cqv-stat-value">${cocSan.current != null ? cocSan.current : '--'}/${cocSan.max != null ? cocSan.max : '--'}</span></div>`;
      html += `<div class="cqv-stat"><span class="cqv-stat-label">LUCK</span><span class="cqv-stat-value">${cocLuck.current != null ? cocLuck.current : '--'}</span></div>`;
      html += `<div class="cqv-stat"><span class="cqv-stat-label">MP</span><span class="cqv-stat-value">${cocMp.current != null ? cocMp.current : '--'}/${cocMp.max != null ? cocMp.max : '--'}</span></div>`;
    } else {
      html += `<div class="cqv-stat"><span class="cqv-stat-label">HP</span><span class="cqv-stat-value cqv-hp">${this._esc(cd.hp || '--')}</span></div>`;
      html += `<div class="cqv-stat"><span class="cqv-stat-label">AC</span><span class="cqv-stat-value cqv-ac">${this._esc(g('AC', 'ac') || '--')}</span></div>`;
      const initVal = g('先攻', 'initiative');
      html += `<div class="cqv-stat"><span class="cqv-stat-label">先攻</span><span class="cqv-stat-value cqv-init">${this._esc(initVal || '--')}${initVal ? ' (' + dexModStr + ')' : ''}</span></div>`;
      html += `<div class="cqv-stat"><span class="cqv-stat-label">速度</span><span class="cqv-stat-value cqv-speed">${this._esc(g('速度', 'speed') || '--')}</span></div>`;
    }
    html += '</div>';
    
    html += '<div class="cqv-abilities">';
    if (cd._coc7 && cd.attributes) {
      // COC 八大属性
      Object.entries(cd.attributes).forEach(([key, attr]) => {
        const v = attr.value || 0;
        html += `<div class="cqv-ability"><span class="cqv-ability-label">${this._esc(attr.name || key)}</span><span class="cqv-ability-value">${v}<span style="font-size:9px;color:var(--text-muted);margin-left:2px;">(½${Math.floor(v/2)})</span></span></div>`;
      });
    } else {
      const abLabels = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
      abLabels.forEach(label => {
        const val = g(label, flatKeys[label]) || '--';
        html += `<div class="cqv-ability"><span class="cqv-ability-label">${label}</span><span class="cqv-ability-value">${this._esc(val)}</span></div>`;
      });
    }
    html += '</div>';
    
    // 物品（COC用inventory数组，D&D用fields._items JSON）
    if (cd._coc7 && Array.isArray(cd.inventory) && cd.inventory.length > 0) {
      html += '<div class="cqv-section"><div class="cqv-section-title">物品</div><div class="cqv-items">';
      cd.inventory.slice(0, 6).forEach(it => {
        html += `<span class="cqv-item">${this._esc(it.name || '')}</span>`;
      });
      if (cd.inventory.length > 6) html += `<span class="cqv-item">+${cd.inventory.length - 6}</span>`;
      html += '</div></div>';
    } else if (f['_items']) {
      let items = [];
      try { items = JSON.parse(f['_items'] || '[]'); } catch(e) {}
      if (items.length > 0) {
        html += '<div class="cqv-section"><div class="cqv-section-title">物品</div><div class="cqv-items">';
        items.slice(0, 6).forEach(it => {
          html += `<span class="cqv-item">${this._esc(it.name || '')}</span>`;
        });
        if (items.length > 6) html += `<span class="cqv-item">+${items.length - 6}</span>`;
        html += '</div></div>';
      }
    }
    
    if (f['_spells']) {
      let spells = [];
      try { spells = JSON.parse(f['_spells'] || '[]'); } catch(e) {}
      if (spells.length > 0) {
        html += '<div class="cqv-section"><div class="cqv-section-title">法术</div><div class="cqv-items">';
        spells.slice(0, 6).forEach(sp => {
          const levelLabel = sp.level === 0 ? '戏法' : sp.level + '环';
          html += `<span class="cqv-item">${levelLabel} ${this._esc(sp.name || '')}</span>`;
        });
        if (spells.length > 6) html += `<span class="cqv-item">+${spells.length - 6}</span>`;
        html += '</div></div>';
      }
    }
    
    html += '<div class="cqv-footer"><span>双击查看详情</span><span>角色图鉴</span></div>';
    
    qv.innerHTML = html;
    
    const rect = e.target.getBoundingClientRect();
    let x = rect.right + 12;
    let y = rect.top;
    
    if (x + 300 > window.innerWidth) {
      x = rect.left - 312;
    }
    if (y + 350 > window.innerHeight) {
      y = window.innerHeight - 350;
    }
    
    qv.style.left = x + 'px';
    qv.style.top = y + 'px';
    
    qv.classList.add('visible');
  },

  _boHideQuickView() {
    const qv = document.getElementById('charQuickView');
    if (qv) qv.classList.remove('visible');
  },

  /* ---------- 战斗行动面板 ---------- */
  _boShowActionPanel(pid) {
    const panel = document.getElementById('boActionPanel');
    if (!panel) return;
    
    const battle = this._getCurrentBattle();
    if (!battle) return;
    
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    
    this._boCurrentActionPid = pid;
    
    const titleEl = document.getElementById('boActionPanelTitle');
    if (titleEl) {
      titleEl.innerHTML = `<span class="bo-action-panel-title-name">${this._esc(p.instanceName)}</span> 的行动面板`;
    }
    
    this._boRenderActionPanel(pid);
  },

  _boHideActionPanel() {
    this._boCurrentActionPid = null;
    const titleEl = document.getElementById('boActionPanelTitle');
    if (titleEl) {
      titleEl.textContent = '选择角色查看行动';
    }
    const cardsEl = document.getElementById('boActionCards');
    if (cardsEl) {
      cardsEl.innerHTML = '';
    }
    const alertsBar = document.getElementById('boActionAlertsBar');
    if (alertsBar) {
      alertsBar.style.display = 'none';
      alertsBar.classList.remove('show');
    }
    this._boHideActionCardTooltip();
  },

  _boRenderActionPanel(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return;
    
    const p = this._getParticipant(battle, pid);
    if (!p) return;
    
    const cd = this._getParticipantCharData(p);
    const f = cd ? (cd.fields || {}) : {};
    
    const alertsData = this._boCheckStatusAlerts(pid);
    const alertsBar = document.getElementById('boActionAlertsBar');
    const alertsLeft = document.getElementById('boActionAlertsLeft');
    const alertsRight = document.getElementById('boActionAlertsRight');
    const actionPanel = document.getElementById('boActionPanel');
    
    if (alertsBar && alertsLeft && alertsRight && actionPanel) {
      if (alertsData && alertsData.tags.length > 0) {
        alertsLeft.innerHTML = alertsData.tags.join('');
        alertsRight.innerHTML = `<button class="bo-action-alerts-all-btn" onclick="BoardManager._boConfirmAllAlerts()">全部确认</button>`;
        alertsBar.style.display = 'flex';
        alertsBar.classList.add('show');
        requestAnimationFrame(() => this._boRepositionAlertsBar());
      } else {
        alertsBar.style.display = 'none';
        alertsBar.classList.remove('show');
      }
    }
    
    let cardsHtml = '';
    
    const basicActions = [
      { name: '攻击', type: 'attack', tag: '动作', desc: '当你执行攻击动作时，你可以用你的武器或徒手打击进行一次攻击检定。作为攻击动作的一部分，每当你发动一次攻击时，你都可以装备或卸下一把武器。你可以在此次攻击之前或之后装备/卸下武器。你的回合中，如果你具有某些可以使你在攻击动作中发动复数次攻击的特性（例如额外攻击），你可以使用一部分或全部移动力，在这几次攻击之间进行移动。' },
      { name: '疾走', type: 'action', tag: '动作', desc: '当你执行疾走动作时，你可以获得供当前回合使用的一些额外移动力。额外移动力的量等于你的速度（在一切调整值计算完后）。举个例子，如果你有30尺速度，而你执行了疾走动作，那么当前回合你就可以移动至多60尺距离。如果你拥有特殊速度（例如飞行速度或游泳速度），你可以使用该速度代替你的速度来执行疾走动作。每次你执行疾走动作时你都需要选择具体使用哪个速度。' },
      { name: '撤离', type: 'action', tag: '动作', desc: '执行撤离动作后，当前回合的剩余时间内，你的移动不会引发借机攻击。' },
      { name: '回避', type: 'action', tag: '动作', desc: '执行回避动作时，你将获得以下增益：直至你的下个回合开始，任何以你为目标的攻击检定具有劣势，除非你看不见攻击者，且你进行的敏捷豁免检定具有优势。如果你陷入失能或你的速度降至了0，你会失去这些增益。' },
      { name: '协助', type: 'action', tag: '动作', desc: '当你执行协助动作时，你可以做到以下两种效果之一。\n辅助一次属性检定：选择一项你的技能熟练或工具熟练，并选择一个与你之间距离不远，至少你足以口头/物理上辅助的盟友。那个盟友下一次使用你所选择的技能/工具进行的属性检定具有优势。在你的下个回合开始前，若该盟友仍未使用掉这一辅助效果，辅助效果会消失。\n辅助一次攻击检定：你迅速地虚晃位于你5尺内的一个敌人，令下一次由你的某名盟友对该敌人进行的攻击检定具有优势。这一辅助效果会在你的下个回合开始时消失。' },
      { name: '躲藏', type: 'action', tag: '动作', desc: '执行躲藏动作时，你尝试将自己隐蔽起来。为了执行躲藏，你必须成功通过一次DC15的敏捷（隐匿）检定，你只有身处重度遮蔽之中或者处于四分之三掩护或全身掩护之后，还不在任何敌人的视野内（如果你能看到一个生物，你就可以判断它是否能够看见你），才能这么做。\n若检定成功，躲藏期间你处于隐形状态。记下你的检定结果总值，这将成为其他生物通过一个感知（察觉）检定来找到你的DC。\n发生以下情况时，你结束躲藏：你发出了高于低语的响声；敌人找到了你；你进行一次攻击检定；你施展了一个带有言语成分的法术。' },
      { name: '影响', type: 'action', tag: '动作', desc: '借由影响动作，你尝试要求一个怪物去做些什么事。请描述或扮演出你与怪物之间是如何交流的。你是在欺骗它？恐吓它？取悦它？还是和蔼地说服它？然后，根据你与怪物的互动，由DM来决定这怪物愿意、不愿意还是犹豫不决。如果怪物对于你要求去做的事情有些犹豫，你必须进行一次属性检定：魅力（欺瞒）用于欺骗、魅力（威吓）用于恐吓、魅力（表演）用于取悦、魅力（游说）用于说服、感知（驯兽）用于和蔼地劝诱野兽。检定的DC默认为15或怪物的智力属性值，两者取高者。检定成功时，怪物会按你要求的去做。检定失败时，你必须等待24小时后才能再次以影响动作向它要求。' },
      { name: '魔法', type: 'action', tag: '动作', desc: '当你执行魔法动作时，你施展某个施法时间为动作的法术、使用某个需要使用魔法动作的特性或是使用一个"需要魔法动作来激活"的魔法物品。若你需要施展一道施法时间为1分钟以上的法术，你必须在施展该法术期间的每个回合中都执行魔法动作，且你必须为其保持专注。若你的专注被打断，法术将施展失败，但你不会因此消耗法术位。' },
      { name: '预备', type: 'action', tag: '动作', desc: '你可以执行预备动作来等待某个特定事件到来，再进行你的行动。为此，你需要在自己回合中执行预备动作，使你可以在自己的下个回合开始前执行一项反应。首先，你需要设定"何种可感知的事件能触发你的反应"。然后，作为你对该事件的响应，你选择你当时要执行的动作或是选择移动等于你速度的距离。当触发事件发生时，你可以选择在触发事件完成后紧跟着执行你设定的响应动作或是选择无视该触发事件。当你预备一道法术时，你需要如常施展它来维持其能量，并在触发事件发生时用你的反应去释放它。为预备一道法术，这道法术的施法时间必须是动作，且你在维持法术魔法能量期间必须为其保持专注。' },
      { name: '搜索', type: 'action', tag: '动作', desc: '当你执行搜索动作，你进行一次感知检定来搜索某个"并不显眼"的东西。根据你尝试搜索的具体内容：洞悉用于搜索生物的心理状态，医药用于搜索生物的伤势或死因，察觉用于搜索被藏匿的生物或物件，求生用于搜索踪迹或食物。' },
      { name: '研究', type: 'action', tag: '动作', desc: '当你执行研究动作时，你进行一次智力检定来研究你的记忆、一本书、一条线索或是其他来源的知识，并回忆起有关这一事物的重要信息。根据智力检定相关的知识范围：奥秘用于法术、魔法物品、魔能符号、魔法传承、存在位面、特定生物（异怪、构装、元素、妖精、怪兽）；历史用于历史事件和历史人物、古文明、战争、特定生物（巨人、类人）；调查用于陷阱、密文、谜语、设备；自然用于地形、植物、天气、特定生物（野兽、龙类、泥怪、植物）；宗教用于神祇、宗教层级和仪式、圣徽、教团、特定生物（天族、邪魔、亡灵）。' },
      { name: '操作', type: 'action', tag: '动作', desc: '通常，你会在做其他事的同时与一件物品进行交互，例如作为攻击动作的一部分来拔出一把剑。当一个物件需要一个动作才能使用时，你需要为其执行操作动作。' },
    ];
    
    basicActions.forEach(action => {
      cardsHtml += this._boCreateActionCard(action.name, action.tag, action.desc, action.type, null);
    });
    
    if (f['_traits'] || cd.traits) {
      let traits = [];
      try { traits = JSON.parse(f['_traits'] || '[]'); } catch(e) {}
      if (!traits.length && cd.traits) traits = cd.traits;
      
      traits.forEach(t => {
        cardsHtml += this._boCreateActionCard(t.title || '', '特性', t.desc || '', 'feature', null);
      });
    }
    
    if (f['_actions'] || cd.actions) {
      let actions = [];
      try { actions = JSON.parse(f['_actions'] || '[]'); } catch(e) {}
      if (!actions.length && cd.actions) actions = cd.actions;
      
      actions.forEach(a => {
        cardsHtml += this._boCreateActionCard(a.title || '', '动作', a.desc || '', 'action', null);
      });
    }
    
    if (f['_spells']) {
      let spells = [];
      try { spells = JSON.parse(f['_spells'] || '[]'); } catch(e) {}
      
      spells.forEach(sp => {
        const levelLabel = sp.level === 0 ? '戏法' : '法';
        cardsHtml += this._boCreateActionCard(sp.name || '', levelLabel, sp.desc || '', 'spell', { level: sp.level });
      });
    }
    
    if (f['_items']) {
      let items = [];
      try { items = JSON.parse(f['_items'] || '[]'); } catch(e) {}
      
      items.forEach(it => {
        cardsHtml += this._boCreateActionCard(it.name || '', '道具', it.desc || '', 'item', { count: it.count || 1 });
      });
    }
    
    const cardsEl = document.getElementById('boActionCards');
    if (cardsEl) {
      cardsEl.innerHTML = cardsHtml;
    }
    
    document.querySelectorAll('.bo-action-card').forEach(card => {
      card.addEventListener('mouseenter', (e) => {
        this._boShowActionCardTooltip(e, card);
      });
      card.addEventListener('mouseleave', () => {
        this._boHideActionCardTooltip();
      });
    });

    // 检测文字溢出，触发竖排滚动动画
    document.querySelectorAll('.bo-action-card-name').forEach(nameEl => {
      if (nameEl.scrollHeight > nameEl.clientHeight + 2) {
        nameEl.classList.add('scrolling');
      }
    });
  },

  _boGetActionIcon(name, type) {
    const actionIcons = {
      '攻击': { emoji: '⚔️', color: 'attack' },
      '移动': { emoji: '🚶', color: 'move' },
      '疾走': { emoji: '🏃', color: 'move' },
      '冲刺': { emoji: '💨', color: 'move' },
      '闪避': { emoji: '🛡️', color: 'dodge' },
      '回避': { emoji: '🛡️', color: 'dodge' },
      '隐蔽': { emoji: '🕶️', color: 'item' },
      '躲藏': { emoji: '🌿', color: 'explore' },
      '搜索': { emoji: '🔍', color: 'explore' },
      '协助': { emoji: '🤝', color: 'help' },
      '帮助': { emoji: '🤝', color: 'help' },
      '安抚': { emoji: '💬', color: 'comfort' },
      '撤离': { emoji: '🚪', color: 'escape' },
      '脱离': { emoji: '🚪', color: 'escape' },
      '预备': { emoji: '⏳', color: 'explore' },
      '操作': { emoji: '📦', color: 'item' },
      '使用': { emoji: '✨', color: 'item' },
      '研究': { emoji: '📚', color: 'feature' },
      '魔法': { emoji: '🔮', color: 'magic' },
      '施法': { emoji: '🧙', color: 'magic' },
      '影响': { emoji: '💫', color: 'magic' },
      '解除': { emoji: '✖️', color: 'dodge' }
    };
    
    const typeIcons = {
      'attack': { emoji: '⚔️', color: 'attack' },
      'action': { emoji: '⚡', color: 'feature' },
      'feature': { emoji: '📚', color: 'feature' },
      'spell': { emoji: '🔮', color: 'magic' },
      'item': { emoji: '✨', color: 'item' }
    };
    
    if (actionIcons[name]) return actionIcons[name];
    return typeIcons[type] || typeIcons.action;
  },

  _boCreateActionCard(name, tag, desc, type, meta) {
    const count = meta && meta.count ? meta.count : null;
    const level = meta && meta.level ? meta.level : null;
    const iconData = this._boGetActionIcon(name, type);
    
    let levelHtml = '';
    if (level !== null && type === 'spell') {
      const levelClass = level === 0 ? 'cantrip' : '';
      const levelText = level === 0 ? '∞' : level;
      levelHtml = `<span class="bo-action-card-level ${levelClass}">${levelText}</span>`;
    }
    
    return `
      <div class="bo-action-card ${type}">
        <div class="bo-action-card-icon bo-action-card-icon-${iconData.color}">${iconData.emoji}</div>
        <div class="bo-action-card-name">${this._esc(name)}</div>
        <div class="bo-action-card-footer">
          <span class="bo-action-card-tag">${this._esc(tag)}</span>
          ${levelHtml}
          ${count ? `<span class="bo-action-card-count">x${count}</span>` : ''}
        </div>
        <div class="bo-action-card-desc">${this._esc(desc)}</div>
      </div>
    `;
  },

  _boShowActionCardTooltip(e, card) {
    const tooltip = document.getElementById('boActionCardTooltip');
    if (!tooltip) return;
    
    const name = card.querySelector('.bo-action-card-name')?.textContent || '';
    const tag = card.querySelector('.bo-action-card-tag')?.textContent || '';
    const desc = card.querySelector('.bo-action-card-desc')?.textContent || '';
    
    tooltip.innerHTML = `
      <div class="act-name">${this._esc(name)}</div>
      <div class="act-tag">${this._esc(tag)}</div>
      <div class="act-desc">${this._esc(desc) || '暂无描述'}</div>
    `;
    
    const rect = card.getBoundingClientRect();
    
    const tooltipWidth = 300;
    const tooltipHeight = 200;
    
    let x = rect.right + 12;
    let y = rect.top;
    
    if (x + tooltipWidth > window.innerWidth) {
      x = rect.left - tooltipWidth - 12;
    }
    
    if (rect.bottom + tooltipHeight > window.innerHeight) {
      y = rect.top - tooltipHeight - 12;
    }
    
    if (x < 0) {
      x = rect.right + 12;
    }
    
    if (y < 0) {
      y = rect.bottom + 12;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.display = 'block';
  },

  _boHideActionCardTooltip() {
    const tooltip = document.getElementById('boActionCardTooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  _boGetStatusClass(name) {
    const statusMap = {
      '目盲': 'status-blinded', '魅惑': 'status-charmed', '耳聋': 'status-deafened',
      '恐慌': 'status-frightened', '擒抱': 'status-grappled', '失能': 'status-incapacitated',
      '隐形': 'status-invisible', '麻痹': 'status-paralyzed', '石化': 'status-petrified',
      '中毒': 'status-poisoned', '倒地': 'status-prone', '束缚': 'status-restrained',
      '震慑': 'status-stunned', '昏迷': 'status-unconscious', '专注': 'status-concentrating'
    };
    for (const [key, value] of Object.entries(statusMap)) {
      if (name.includes(key)) return value;
    }
    return 'status-concentrating';
  },

  _boGetStatusDescription(name) {
    const descMap = {
      '目盲': '目盲状态下，你会遭受以下效果：\n• 看不见，自动失败任何需要看见的感知（察觉）检定\n• 以你为目标的攻击检定有优势，你做出的攻击检定有劣势\n\n摆脱方式：通常由法术或效果持续时间决定，需通过解除法术或治疗效果移除；无豁免检定',
      '魅惑': '魅惑状态下，你会遭受以下效果：\n• 无法伤害魅惑者，也无法对魅惑者产生任何怀有敌意的效果\n• 魅惑者对你进行的任何社交检定有优势\n\n摆脱方式：每轮结束时可尝试魅力豁免（DC=8+施法者职业等级/熟练加值+施法者魅力调整值）；受到魅惑者或其盟友的伤害时立即进行一次豁免',
      '耳聋': '耳聋状态下，你会遭受以下效果：\n• 听不见，自动失败任何需要听见的感知（察觉）检定\n\n摆脱方式：通常由法术或效果持续时间决定，需通过解除法术或治疗效果移除；无豁免检定',
      '恐慌': '恐慌状态下，你会遭受以下效果：\n• 只要恐惧源在你视线范围内，你做出的能力检定和攻击检定都有劣势\n• 无法自愿地向恐惧源所在方向移动\n\n摆脱方式：每轮结束时可尝试智慧豁免（DC=10+恐惧效果来源的攻击修正+来源的魅力调整值）；恐惧源离开视线范围时自动结束',
      '擒抱': '擒抱状态下，你会遭受以下效果：\n• 速度变为0，无法移动\n• 被擒抱者对任何不在你5尺内的目标做出的攻击检定有劣势\n• 被擒抱者移动时会带着你一起移动，但每移动1尺需要为了拖动你而额外花费1尺移动力\n\n摆脱方式：可通过动作进行力量（Athletics）或敏捷（Acrobatics）检定对抗擒抱者的对应技能检定结果',
      '失能': '失能状态下，你会遭受以下效果：\n• 无法执行任何动作或反应\n• 无法维持专注\n• 无法说话\n• 如果你在战斗开始时处于失能状态，你会措手不及\n\n摆脱方式：通常由法术或效果持续时间决定；受到伤害时可尝试体质豁免（DC=10）苏醒',
      '隐形': '隐形状态下，你会遭受以下效果：\n• 如果你在战斗开始时处于隐形状态，你会措手不及\n• 任何需要能看见你才能生效的效果都影响不到你，除非效果来源通过某种方式感知到了你\n• 以你为目标的攻击检定有劣势，你做出的攻击检定有优势\n\n摆脱方式：攻击或造成伤害后显形；通常由法术造成，需解除法术或等待持续时间结束；无豁免检定',
      '麻痹': '麻痹状态下，你会遭受以下效果：\n• 处于失能状态\n• 速度变为0，无法移动\n• 自动失败力量和敏捷豁免检定\n• 以你为目标的攻击检定有优势\n• 如果攻击者距离你5尺以内，任何对你的攻击检定都会变成暴击\n\n摆脱方式：每轮结束时可尝试体质豁免（DC=8+施法者职业等级/熟练加值+施法者魅力调整值）',
      '石化': '石化状态下，你会遭受以下效果：\n• 变为无生命物质，通常变成石头\n• 处于失能状态\n• 速度变为0，无法移动\n• 以你为目标的攻击检定有优势\n• 自动失败力量和敏捷豁免检定\n• 对所有伤害具有抗性\n• 对中毒状态免疫\n\n摆脱方式：每轮结束时可尝试体质豁免（DC=8+施法者职业等级/熟练加值+施法者体质调整值）；某些效果允许亲友使用医疗技能协助；通常需要解除石化法术',
      '中毒': '中毒状态下，你会遭受以下效果：\n• 你做出的攻击检定和能力检定都有劣势\n\n摆脱方式：接触或受到毒素伤害时立即进行体质豁免（DC=毒素等级+毒素制造者的体质调整值）；毒素持续时间结束后自动解除',
      '倒地': '倒地状态下，你会遭受以下效果：\n• 唯一的移动选项是爬行，爬速为你速度一半的数值向下取整\n• 你做出的攻击检定有劣势\n• 攻击者距离你5尺以内，以你为目标的攻击检定有优势；攻击者距离超过5尺，以你为目标的攻击检定有劣势\n\n摆脱方式：花费一半速度站立起来；被他人扶起花费一个动作；无豁免检定',
      '束缚': '束缚状态下，你会遭受以下效果：\n• 速度变为0，无法移动\n• 以你为目标的攻击检定有优势，你做出的攻击检定有劣势\n• 你做出的敏捷豁免检定有劣势\n\n摆脱方式：每轮可尝试一次力量或敏捷豁免（DC=束缚物强度，通常为10-20）；或通过破坏束缚物来摆脱',
      '震慑': '震慑状态下，你会遭受以下效果：\n• 处于失能状态\n• 自动失败力量和敏捷豁免检定\n• 以你为目标的攻击检定有优势\n\n摆脱方式：每轮结束时可尝试体质豁免（DC=8+施法者职业等级/熟练加值+施法者魅力调整值）',
      '昏迷': '昏迷状态下，你会遭受以下效果：\n• 处于失能状态且失明\n• 速度变为0，无法移动\n• 以你为目标的攻击检定有优势\n• 自动失败力量和敏捷豁免检定\n• 如果攻击者距离你5尺以内，任何对你的攻击检定都会变成暴击\n• 无法察觉周围发生的事\n\n摆脱方式：受到伤害时立即进行体质豁免（DC=10）；昏迷1小时后自动苏醒',
      '专注': '正在维持专注施法状态\n\n专注规则：当你维持专注法术时，受到伤害必须进行体质豁免（DC=10+受到的伤害值）；豁免失败则失去专注，法术终止'
    };
    for (const [key, value] of Object.entries(descMap)) {
      if (name.includes(key)) return value;
    }
    return '';
  },

  _boCheckStatusAlerts(pid) {
    const battle = this._getCurrentBattle();
    if (!battle) return { tags: [] };

    const ct = this._getCombatTracker(this._getParticipant(battle, pid));
    if (!ct || !ct.statuses || ct.statuses.length === 0) return { tags: [] };

    const saveStatuses = ['魅惑', '目盲', '恐慌', '束缚', '昏迷', '麻痹', '石化', '震慑', '中毒', '擒抱', '失能', '隐形', '耳聋', '倒地', '专注'];
    const alerts = ct.statuses.filter(s => {
      const sName = typeof s === 'string' ? s : (s.name || '');
      return saveStatuses.some(ss => sName.includes(ss));
    });

    if (alerts.length === 0) return { tags: [] };

    const tags = [];
    alerts.forEach((s, i) => {
      const sName = typeof s === 'string' ? s : (s.name || '');
      const emoji = this._getStatusEmoji(sName);
      const statusClass = this._boGetStatusClass(sName);
      const duration = typeof s === 'string' ? '' : (s.duration ? `${s.duration}${s.unit === 'rounds' ? '轮' : '分'}` : '');
      tags.push(`<div class="bo-action-alert-tag ${statusClass}" onclick="BoardManager._boConfirmAlert(this)" onmouseenter="BoardManager._boShowStatusDetail(event, '${this._esc(sName)}')" onmouseleave="BoardManager._boHideStatusDetail()" style="animation-delay: ${i * 0.4}s;">
        <span class="bo-action-alert-tag-icon">${emoji}</span>
        <span class="bo-action-alert-tag-name">${this._esc(sName)}</span>
        ${duration ? `<span class="bo-action-alert-tag-duration">${duration}</span>` : ''}
        <span class="bo-action-alert-tag-check">✓</span>
      </div>`);
    });

    return { tags };
  },

  _boConfirmAlert(el) {
    if (el) el.classList.toggle('confirmed');
  },

  _boConfirmAllAlerts() {
    document.querySelectorAll('.bo-action-alert-tag').forEach(el => {
      el.classList.add('confirmed');
    });
  },

  _boClearActionAlerts() {
    const alertsEl = document.getElementById('boActionAlertsBar');
    if (alertsEl) {
      alertsEl.style.display = 'none';
      alertsEl.classList.remove('show');
    }
  },

  _boRepositionAlertsBar() {
    const alertsBar = document.getElementById('boActionAlertsBar');
    if (!alertsBar || !alertsBar.classList.contains('show')) return;
    const isCustom = typeof SystemManager !== 'undefined' && SystemManager.getCurrentSystem() !== 'dnd5r';

    if (isCustom) {
      const actionBarFloat = document.getElementById('boActionBarFloat');
      if (!actionBarFloat) return;
      const fr = actionBarFloat.getBoundingClientRect();
      alertsBar.style.left = (fr.right + 6) + 'px';
      alertsBar.style.bottom = (window.innerHeight - fr.bottom) + 'px';
      alertsBar.style.top = 'auto';
      alertsBar.style.width = 'auto';
    } else {
      const actionPanel = document.getElementById('boActionPanel');
      if (!actionPanel) return;
      const headerEl = actionPanel.querySelector('.bo-action-panel-header');
      if (!headerEl) return;
      const hr = headerEl.getBoundingClientRect();
      alertsBar.style.left = hr.left + 'px';
      alertsBar.style.width = hr.width + 'px';
      alertsBar.style.bottom = (window.innerHeight - hr.top) + 'px';
      alertsBar.style.top = 'auto';
    }
  },

  _boShowStatusDetail(e, statusName) {
    const tooltip = document.getElementById('boStatusDetailTooltip');
    if (!tooltip) return;
    
    const desc = this._boGetStatusDescription(statusName);
    if (!desc) return;
    
    tooltip.innerHTML = `
      <div class="bo-status-detail-title">${this._esc(statusName)}</div>
      <div class="bo-status-detail-content">${this._esc(desc)}</div>
    `;
    
    // 先测量高度（display:none 下 offsetHeight 为 0，需要临时可见）
    tooltip.style.display = 'block';
    tooltip.style.visibility = 'hidden';
    const th = tooltip.offsetHeight;
    const tw = tooltip.offsetWidth;
    tooltip.style.visibility = '';
    tooltip.style.display = '';
    
    const rect = e.target.getBoundingClientRect();
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 12;
    
    // 四方向防出画
    if (y + th > window.innerHeight) {
      y = rect.top - th - 12;
    }
    if (y < 0) {
      y = rect.bottom + 12;
    }
    x = Math.max(8, Math.min(x - tw / 2, window.innerWidth - tw - 8));
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.display = 'block';
  },

  _boHideStatusDetail() {
    const tooltip = document.getElementById('boStatusDetailTooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  // ========== 横向滚动容器：拖拽滚动 + 滚轮横向滚动 ==========

  _boBindScrollEvents() {
    const actionCards = document.getElementById('boActionCards');
    const turnList = document.getElementById('boTurnList');

    if (actionCards) {
      this._boInitDragScroll(actionCards);
      this._boInitWheelScroll(actionCards);
      this._boInitScrollShadow(actionCards);
    }
    if (turnList) {
      this._boInitWheelScroll(turnList);
      this._boInitScrollShadow(turnList, 'boTurnListWrap');
    }
  },

  // 鼠标拖拽驱动横向滚动
  _boInitDragScroll(el) {
    let dragging = false;
    let startX = 0;
    let startScroll = 0;

    el.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    });

    // 绑定到 document，防止鼠标移出容器后拖拽失效
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      el.scrollLeft = startScroll - dx;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = '';
      el.style.userSelect = '';
    });
  },

  // 鼠标滚轮驱动横向滚动
  _boInitWheelScroll(el) {
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }, { passive: false });
  },

  // 滚动溢出光效：检测两侧是否有隐藏内容
  _boInitScrollShadow(scrollEl, panelId) {
    const panel = document.getElementById(panelId || 'boActionPanelBody');
    if (!panel) return;

    const update = () => {
      const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
      const atLeft = scrollEl.scrollLeft <= 0;
      const atRight = scrollEl.scrollLeft >= maxScroll - 1;
      panel.classList.toggle('shadow-left', !atLeft);
      panel.classList.toggle('shadow-right', !atRight);
    };

    scrollEl.addEventListener('scroll', update, { passive: true });
    // 内容变化时也更新（比如切换角色面板）
    const observer = new MutationObserver(() => update());
    observer.observe(scrollEl, { childList: true, subtree: true });
    update();
  }
};

/* ==========================================================================
 * 角色图鉴模块
 * 管理角色列表展示和详情查看，支持玩家角色/怪物分类、搜索、编辑
 * ========================================================================== */
const CharAlbum = {
  _currentTab: 'players',
  _currentCharacterId: null,
  _searchQuery: '',
  _isEditing: false,

  init() {
    this.renderCharacterList();
  },

  getCharacters() {
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return [];
    
    const chars = [];
    mod.board.flowUnits.forEach(unit => {
      if (!unit.notes) return;
      unit.notes.forEach(note => {
        if (note.type === 'characters' && note.characterData) {
          chars.push({
            id: note.id,
            note: note,
            characterData: note.characterData,
            unitTitle: unit.title || '未命名单元'
          });
        }
      });
    });
    return chars;
  },

  switchTab(tab) {
    this._currentTab = tab;
    document.querySelectorAll('.char-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.char-tab[data-tab="${tab}"]`)?.classList.add('active');
    this.renderCharacterList();
  },

  searchCharacters(query) {
    this._searchQuery = query.toLowerCase();
    this.renderCharacterList();
  },

  renderCharacterList() {
    const listEl = document.getElementById('charList');
    if (!listEl) return;

    let chars = this.getCharacters();

    if (this._searchQuery) {
      chars = chars.filter(c => {
        const name = (c.characterData.name || c.note.title || '').toLowerCase();
        const unitTitle = c.unitTitle.toLowerCase();
        return name.includes(this._searchQuery) || unitTitle.includes(this._searchQuery);
      });
    }

    const isPlayer = this._currentTab === 'players';
    chars = chars.filter(c => {
      const faction = c.characterData.faction || 'pc';
      return isPlayer ? (faction === 'pc') : (faction !== 'pc');
    });

    if (chars.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">暂无角色</div>';
      return;
    }

    let html = '';
    chars.forEach(c => {
      const name = c.characterData.name || c.note.title || '未命名';
      let hp;
      if (c.characterData.hp && typeof c.characterData.hp === 'object') {
        hp = (c.characterData.hp.current != null ? c.characterData.hp.current : '--') + '/' + (c.characterData.hp.max != null ? c.characterData.hp.max : '--');
      } else {
        hp = c.characterData.hp || '--';
      }
      const initial = name.charAt(0) || '?';
      const isActive = this._currentCharacterId === c.id;

      html += `<div class="char-list-item${isActive ? ' active' : ''}" onclick="CharAlbum._attemptSwitchCharacter('${c.id}')">`;
      html += `<div class="char-list-icon">${initial}</div>`;
      html += `<div class="char-list-info">`;
      html += `<div class="char-list-name">${this._esc(name)}</div>`;
      html += `<div class="char-list-meta">HP ${hp} · ${this._esc(c.unitTitle)}</div>`;
      html += `</div>`;
      html += `</div>`;
    });

    listEl.innerHTML = html;
  },

  selectCharacter(charId) {
    this._currentCharacterId = charId;
    this.renderCharacterList();
    this.renderCharacterDetail(charId);
  },

  /* 切换角色卡前检查编辑状态 */
  _attemptSwitchCharacter(charId) {
    if (this._isEditing && charId === this._currentCharacterId) return;
    if (!this._isEditing || charId === this._currentCharacterId) {
      this.selectCharacter(charId);
      return;
    }
    this._pendingCharId = charId;
    document.getElementById('charLeaveConfirm').classList.add('active');
  },

  renderCharacterDetail(charId) {
    const emptyEl = document.getElementById('charDetailEmpty');
    const contentEl = document.getElementById('charDetailContent');
    if (!emptyEl || !contentEl) return;

    const chars = this.getCharacters();
    const char = chars.find(c => c.id === charId);
    if (!char) {
      emptyEl.style.display = 'flex';
      contentEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'block';

    const tplBtn = document.getElementById('btnTplManage');
    if (tplBtn) {
      tplBtn.style.display = (SystemManager.getCurrentSystem() !== 'dnd5r' && SystemManager.getCurrentSystem() !== 'coc7') ? 'inline-flex' : 'none';
    }

    if (SystemManager.getCurrentSystem() === 'coc7') {
      this._renderCocCharacterDetail(char);
      return;
    }

    if (SystemManager.getCurrentSystem() !== 'dnd5r') {
      this._renderCustomCharacterDetail(char);
      return;
    }

    const cd = char.characterData;
    // 兼容扁平字段和 fields 子对象
    const f = cd.fields || {};
    const g = (fieldKey, flatKey) => {
      if (f[fieldKey] !== undefined && f[fieldKey] !== '') return f[fieldKey];
      return cd[flatKey] !== undefined ? cd[flatKey] : '';
    };
    const flatKeys = {
      'AC': 'ac', '护甲等级': 'ac',
      '先攻': 'initiative',
      '速度': 'speed',
      '力量': 'str', '敏捷': 'dex', '体质': 'con', '智力': 'int', '感知': 'wis', '魅力': 'cha'
    };
    const dexVal = parseInt(g('敏捷', 'dex')) || 10;
    const dexMod = Math.floor((dexVal - 10) / 2);
    const dexModStr = dexMod >= 0 ? '+' + dexMod : String(dexMod);

    let html = '<div class="char-detail-header">';
    html += `<div class="char-detail-icon">${(cd.name || char.note.title || '?').charAt(0)}</div>`;
    html += '<div class="char-detail-title-wrap">';
    html += `<h2 class="char-detail-name">${this._esc(cd.name || char.note.title || '未命名')}</h2>`;
    const enName = f['英文名称'] || cd.enName || '';
    if (enName) {
      html += `<span class="char-detail-en">${this._esc(enName)}</span>`;
    }
    html += '<div class="char-detail-basic">';
    const sizeStr = g('体型', 'size');
    const typeStr = g('类型', 'type');
    const alignStr = g('阵营', 'alignment');
    if (sizeStr) html += `<span>${this._esc(sizeStr)}</span>`;
    if (typeStr) html += `<span>${this._esc(typeStr)}</span>`;
    if (alignStr) html += `<span>${this._esc(alignStr)}</span>`;
    html += '</div></div></div>';

    html += '<div class="char-detail-stats">';
    html += `<div class="char-stat-card"><span class="char-stat-label">HP</span><span class="char-stat-value char-stat-hp">${this._esc(cd.hp || '--')}</span></div>`;
    html += `<div class="char-stat-card"><span class="char-stat-label">AC</span><span class="char-stat-value char-stat-ac">${this._esc(g('AC', 'ac') || '--')}</span></div>`;
    const initVal = g('先攻', 'initiative');
    html += `<div class="char-stat-card"><span class="char-stat-label">先攻</span><span class="char-stat-value char-stat-init">${this._esc(initVal || '--')}${initVal ? ' (' + dexModStr + ')' : ''}</span></div>`;
    html += `<div class="char-stat-card"><span class="char-stat-label">速度</span><span class="char-stat-value char-stat-speed">${this._esc(g('速度', 'speed') || '--')}</span></div>`;
    html += '</div>';

    html += '<div class="char-detail-abilities">';
    const abLabels = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
    for (const [key, label] of Object.entries(abLabels)) {
      const val = g(label, flatKeys[label]) || '--';
      const mod = val !== '--' ? Math.floor((parseInt(val) - 10) / 2) : '--';
      const modStr = mod !== '--' ? (mod >= 0 ? '+' : '') + mod : '';
      html += `<div class="char-ability-card"><span class="char-ability-label">${label}</span><span class="char-ability-value">${this._esc(val)}</span><span class="char-ability-mod">${modStr}</span></div>`;
    }
    html += '</div>';

    // 技能/免疫/抗性/感官/语言/CR
    const metaFields = [
      { key: 'skill', label: '技能' },
      { key: 'immune', label: '免疫' },
      { key: 'resistant', label: '抗性' },
      { key: 'senses', label: '感官' },
      { key: 'languages', label: '语言' },
      { key: 'cr', label: 'CR' }
    ];
    let hasMeta = false;
    let metaHtml = '<div class="char-detail-section"><div class="char-detail-meta-grid">';
    metaFields.forEach(({ key, label }) => {
      const val = g(label, key);
      if (val) {
        hasMeta = true;
        metaHtml += `<div class="char-detail-meta-item"><span class="char-detail-meta-label">${label}</span><span class="char-detail-meta-value">${this._esc(String(val))}</span></div>`;
      }
    });
    metaHtml += '</div></div>';
    if (hasMeta) html += metaHtml;

    // 武器
    if (f['_weapons']) {
      let weapons = [];
      try { weapons = JSON.parse(f['_weapons'] || '[]'); } catch(e) {}
      
      if (weapons.length > 0) {
        html += '<div class="char-detail-section"><h3>武器</h3><div class="char-detail-list">';
        weapons.forEach(w => {
          html += `<div class="char-detail-item char-weapon-item">
            <span class="char-detail-item-name">${this._esc(w.name || '')}</span>
            <div class="char-weapon-grid">
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">特性</span><span class="char-weapon-prop-value">${this._esc(w.traits || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">攻击骰</span><span class="char-weapon-prop-value">${this._esc(w.attack || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">伤害骰</span><span class="char-weapon-prop-value">${this._esc(w.damage || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">类型</span><span class="char-weapon-prop-value">${this._esc(w.type || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">精通</span><span class="char-weapon-prop-value">${this._esc(w.mastery || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">重量</span><span class="char-weapon-prop-value">${this._esc(w.weight || '')}</span></div>
              <div class="char-weapon-prop"><span class="char-weapon-prop-label">同调</span><span class="char-weapon-prop-value">${w.attuned ? '\u2713' : ''}</span></div>
            </div>
          </div>`;
        });
        html += '</div></div>';
      }
    }

    // 特质：兼容 fields._traits / fields.traits / cd.traits 三种存储位置
    let traits = [];
    try { traits = JSON.parse(f['_traits'] || f.traits || '[]'); } catch(e) {}
    if (!traits.length && cd.traits) traits = cd.traits;

    if (traits.length > 0) {
      html += '<div class="char-detail-section"><h3>特质</h3><div class="char-detail-list">';
      traits.forEach(t => {
        html += `<div class="char-detail-item"><span class="char-detail-item-name">${this._esc(t.title || '')}</span><span class="char-detail-item-desc">${this._esc(t.desc || '')}</span></div>`;
      });
      html += '</div></div>';
    }

    if (f['_actions'] || cd.actions) {
      let actions = [];
      try { actions = JSON.parse(f['_actions'] || '[]'); } catch(e) {}
      if (!actions.length && cd.actions) actions = cd.actions;
      
      if (actions.length > 0) {
        html += '<div class="char-detail-section"><h3>动作</h3><div class="char-detail-list">';
        actions.forEach(a => {
          html += `<div class="char-detail-item"><span class="char-detail-item-name">${this._esc(a.title || '')}</span><span class="char-detail-item-desc">${this._esc(a.desc || '')}</span></div>`;
        });
        html += '</div></div>';
      }
    }

    if (f['_items']) {
      let items = [];
      try { items = JSON.parse(f['_items'] || '[]'); } catch(e) {}
      
      if (items.length > 0) {
        html += '<div class="char-detail-section"><h3>物品</h3><div class="char-detail-list">';
        items.forEach(it => {
          html += `<div class="char-detail-item"><span class="char-detail-item-name">${this._esc(it.name || '')}</span><span class="char-detail-item-meta">×${it.count || 1}</span><span class="char-detail-item-desc">${this._esc(it.desc || '')}</span></div>`;
        });
        html += '</div></div>';
      }
    }

    if (f['_spells']) {
      let spells = [];
      try { spells = JSON.parse(f['_spells'] || '[]'); } catch(e) {}
      
      if (spells.length > 0) {
        html += '<div class="char-detail-section"><h3>法术</h3><div class="char-detail-list">';
        spells.forEach(sp => {
          const levelLabel = sp.level === 0 ? '戏法' : sp.level + '环';
          let tags = '';
          if (sp.ritual) tags += '<span class="char-tag">仪式</span>';
          if (sp.concentration) tags += '<span class="char-tag">专注</span>';
          const extra = [sp.castingTime, sp.duration].filter(Boolean).join(' · ');
          html += `<div class="char-detail-item char-spell-item" onclick="this.classList.toggle('expanded')">
            <div class="char-spell-summary">
              <span class="char-detail-item-name">${this._esc(sp.name || '')}</span>
              <span class="char-detail-item-meta">${levelLabel}${sp.school ? ' · ' + this._esc(sp.school) : ''}${extra ? ' · ' + this._esc(extra) : ''}</span>
              ${tags}
            </div>
            <div class="char-spell-detail">
              ${sp.desc ? '<div class="char-detail-item-desc">' + this._esc(sp.desc) + '</div>' : ''}
              <div class="char-spell-meta-row">
                ${sp.source ? '<span class="char-spell-meta">出处：' + this._esc(sp.source) + '</span>' : ''}
                ${sp.classes ? '<span class="char-spell-meta">法表：' + this._esc(sp.classes) + '</span>' : ''}
              </div>
            </div>
          </div>`;
        });
        html += '</div></div>';
      }
    }

    // 其他
    const other = g('其他', 'other');
    if (other) {
      html += '<div class="char-detail-section"><h3>其他</h3>';
      html += `<div class="char-detail-other">${this._esc(String(other))}</div>`;
      html += '</div>';
    }

    html += '</div>';

    contentEl.innerHTML = html;
  },

  _renderCustomCharacterDetail(char) {
    const contentEl = document.getElementById('charDetailContent');
    if (!contentEl) return;

    const cd = char.characterData || {};
    const f = cd.fields || {};
    const tpl = CharTemplateManager.getTemplate();
    const esc = (v) => this._esc(v || '');

    const name = f._name || cd.name || char.note.title || '未命名角色';
    const faction = f._faction || cd.faction || 'friendly_npc';
    const hp = f._hp || cd.hp || '';
    const props = f._props || {};
    const sections = f._sections || {};

    const factionMap = {
      pc: '玩家角色',
      friendly_npc: '友方NPC',
      enemy_npc: '敌方NPC'
    };

    let html = '<div class="char-detail-header">';
    html += `<div class="char-detail-icon">${name.charAt(0)}</div>`;
    html += '<div class="char-detail-title-wrap">';
    html += `<h2 class="char-detail-name">${esc(name)}</h2>`;
    html += '<div class="char-detail-basic">';
    html += `<span>${esc(factionMap[faction] || faction)}</span>`;
    html += '</div></div></div>';

    html += '<div class="char-detail-stats">';
    html += `<div class="char-stat-card"><span class="char-stat-label">HP</span><span class="char-stat-value char-stat-hp">${esc(hp) || '--'}</span></div>`;
    html += '</div>';

    if (tpl.properties.length > 0) {
      html += '<div class="char-detail-abilities">';
      tpl.properties.forEach(prop => {
        const val = props[prop.id] || '';
        html += `<div class="char-ability-card">`;
        html += `<span class="char-ability-label">${esc(prop.name)}</span>`;
        html += `<span class="char-ability-value">${esc(val) || '--'}</span>`;
        html += `</div>`;
      });
      html += '</div>';
    }

    tpl.sections.forEach(sec => {
      const items = sections[sec.id] || [];
      if (items.length === 0) return;
      html += `<div class="char-detail-section"><h3>`;
      html += `<span class="icon" style="margin-right:6px;"><svg width="14" height="14"><use href="#${sec.icon}"/></svg></span>`;
      html += `${esc(sec.name)}<span class="section-count">${items.length}</span></h3>`;
      html += '<div class="char-detail-list">';
      items.forEach(it => {
        html += `<div class="char-detail-item"><span class="char-detail-item-name">${esc(it.name || '')}</span>`;
        if (it.desc) html += `<span class="char-detail-item-desc">${esc(it.desc)}</span>`;
        html += `</div>`;
      });
      html += '</div></div>';
    });

    html += '</div>';
    contentEl.innerHTML = html;
  },

  /* ==================== COC 7th 角色图鉴视图 ==================== */
  _renderCocCharacterDetail(char) {
    const contentEl = document.getElementById('charDetailContent');
    if (!contentEl) return;
    const cd = char.characterData || {};
    const esc = (v) => this._esc(v || '');
    const attrs = cd.attributes || {};
    const hp = cd.hp || {}, san = cd.san || {}, luck = cd.luck || {}, mp = cd.mp || {};
    const dbInfo = _cocCalcDB(attrs.str?.value, attrs.siz?.value);

    // Header
    let html = '<div class="char-detail-header">';
    html += `<div class="char-detail-icon">${(cd.name || '?').charAt(0)}</div>`;
    html += '<div class="char-detail-title-wrap">';
    html += `<h2 class="char-detail-name">${esc(cd.name || '未命名')}</h2>`;
    const metaParts = [cd.occupation, cd.age ? cd.age + '岁' : '', cd.gender].filter(Boolean);
    if (metaParts.length) html += `<div class="char-detail-basic">${metaParts.map(m => `<span>${esc(m)}</span>`).join('')}</div>`;
    const metaParts2 = [cd.player ? '玩家: ' + cd.player : '', cd.era, cd.residence, cd.birthplace].filter(Boolean);
    if (metaParts2.length) html += `<div class="char-detail-basic" style="margin-top:2px;">${metaParts2.map(m => `<span>${esc(m)}</span>`).join('')}</div>`;
    html += '</div></div>';

    // Derived stats bar
    html += '<div class="coc-derived-bar">';
    const dCards = [
      { label: 'HP', cur: hp.current, max: hp.max, cls: 'coc-dc-hp' },
      { label: 'SAN', cur: san.current, max: san.max, cls: 'coc-dc-san' },
      { label: 'LUCK', cur: luck.current, max: luck.max || 99, cls: 'coc-dc-luck' },
      { label: 'MP', cur: mp.current, max: mp.max, cls: 'coc-dc-mp' }
    ];
    dCards.forEach(d => {
      html += `<div class="coc-derived-card ${d.cls}">`;
      html += `<span class="coc-dc-label">${d.label}</span>`;
      html += `<span class="coc-dc-value">${d.cur != null ? d.cur : '--'}<span class="coc-dc-max">/${d.max || '--'}</span></span>`;
      html += '</div>';
    });
    html += `<div class="coc-derived-card coc-dc-arm"><span class="coc-dc-label">护甲</span><span class="coc-dc-value">${esc(cd.armor || 0)}</span></div>`;
    html += `<div class="coc-derived-card coc-dc-mov"><span class="coc-dc-label">移动</span><span class="coc-dc-value">${esc(cd.mov || 0)}</span></div>`;
    html += `<div class="coc-derived-card coc-dc-db"><span class="coc-dc-label">伤害加值</span><span class="coc-dc-value">${esc(dbInfo.db)}</span></div>`;
    html += '</div>';

    // 8 Attributes with half/fifth
    html += '<div class="char-detail-abilities coc-attr-grid">';
    for (const [key, attr] of Object.entries(attrs)) {
      const v = attr.value || 0;
      html += `<div class="char-ability-card coc-attr-card">`;
      html += `<span class="char-ability-label">${esc(attr.name)}</span>`;
      html += `<span class="char-ability-value coc-attr-val">${v}</span>`;
      html += `<div class="coc-attr-halves"><span>${Math.floor(v / 2)}</span><span>${Math.floor(v / 5)}</span></div>`;
      html += `<div class="coc-attr-hlabels"><span>半值</span><span>极小</span></div>`;
      html += '</div>';
    }
    html += '</div>';

    // Skills — five-column table
    const skills = cd.skills || [];
    const invested = skills.filter(s => (s.occ || 0) > 0 || (s.int || 0) > 0).length;
    const fifth = Math.ceil(skills.length / 5);
    const sCols = [
      skills.slice(0, fifth),
      skills.slice(fifth, fifth * 2),
      skills.slice(fifth * 2, fifth * 3),
      skills.slice(fifth * 3, fifth * 4),
      skills.slice(fifth * 4)
    ];

    html += '<div class="char-detail-section coc-skills-section">';
    html += `<h3>技能 <span class="section-count">${invested}/${skills.length} 已分配</span></h3>`;
    html += '<div class="coc-skill-filter">';
    html += '<button class="active" onclick="CharAlbum._filterCocSkills(\'all\',this)">全部</button>';
    html += '<button onclick="CharAlbum._filterCocSkills(\'invested\',this)">已分配</button>';
    html += '<button onclick="CharAlbum._filterCocSkills(\'nonzero\',this)">有成功率</button>';
    html += '</div>';
    html += '<div class="coc-skill-columns">';
    sCols.forEach(col => {
      html += '<div class="coc-skill-col">';
      col.forEach(sk => {
        const total = (sk.base || 0) + (sk.occ || 0) + (sk.int || 0);
        const isInv = (sk.occ || 0) > 0 || (sk.int || 0) > 0;
        const tags = `${isInv ? 'invested' : ''} ${total > 0 ? 'nonzero' : ''}`;
        html += `<div class="coc-skill-row${total <= 0 ? ' coc-skill-zero' : ''}" data-filter="${tags}">`;
        html += `<span class="coc-skill-growth${sk.growth ? ' checked' : ''}"></span>`;
        html += `<span class="coc-skill-name" title="${esc(sk.name)}">${esc(_cocSkillDisplayName(sk))}</span>`;
        html += `<span class="coc-skill-total">${total}</span>`;
        html += `<span class="coc-skill-detail">${sk.base}+${sk.occ || 0}+${sk.int || 0}</span>`;
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';

    // Weapons — 3-column card grid
    const weapons = cd.weapons || [];
    if (weapons.length > 0) {
      html += '<div class="char-detail-section"><h3>武器</h3>';
      html += '<div class="coc-weapon-grid">';
      weapons.forEach(w => {
        html += `<div class="coc-weapon-card">`;
        html += `<div class="coc-wc-name">${esc(w.name || '')}</div>`;
        if (w.skill) html += `<div class="coc-wc-skill">${esc(w.skill)}</div>`;
        html += '<div class="coc-wc-stats">';
        html += `<span class="coc-wc-rate">${w.rate != null ? w.rate : '--'}</span>`;
        html += `<span class="coc-wc-dmg">${esc(w.damage || '')}</span>`;
        if (w.range) html += `<span class="coc-wc-range">${esc(w.range)}</span>`;
        html += '</div></div>';
      });
      html += '</div></div>';
    }

    // Inventory
    const inventory = cd.inventory || [];
    if (inventory.length > 0) {
      html += '<div class="char-detail-section"><h3>物品</h3>';
      html += '<div class="coc-inv-grid">';
      inventory.forEach(item => {
        html += `<div class="coc-inv-item"><span class="coc-inv-loc">${esc(item.location || '')}</span><span class="coc-inv-name">${esc(item.name || '')}</span></div>`;
      });
      html += '</div></div>';
    }

    // Insanity Effects
    const insanity = cd.insanityEffects || [];
    html += '<div class="char-detail-section">';
    html += `<h3>疯狂 / 状态 <span class="section-count">${insanity.length > 0 ? insanity.length + ' 项' : '无'}</span></h3>`;
    if (insanity.length === 0) {
      html += '<div class="coc-insanity-empty">暂无疯狂效果</div>';
    } else {
      html += '<div class="coc-insanity-list">';
      insanity.forEach(eff => {
        html += `<div class="coc-insanity-card"><div class="coc-ic-name">${esc(eff.name)}</div>`;
        if (eff.desc) html += `<div class="coc-ic-desc">${esc(eff.desc)}</div>`;
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Background
    const bgFields = [
      { label: '思想与信念', val: cd.ideas },
      { label: '重要之人', val: cd.importantPeople },
      { label: '意义非凡之地', val: cd.meaningfulPlace },
      { label: '宝贵之物', val: cd.treasuredItem },
      { label: '特质', val: cd.trait },
      { label: '恐惧症', val: cd.fear }
    ].filter(f => f.val);
    if (bgFields.length > 0 || cd.backstory) {
      html += '<div class="char-detail-section"><h3>背景故事</h3>';
      if (bgFields.length > 0) {
        html += '<div class="coc-bg-fields">';
        bgFields.forEach(f => {
          html += `<div class="coc-bg-field"><span class="coc-bg-label">${f.label}：</span><span>${esc(f.val)}</span></div>`;
        });
        html += '</div>';
      }
      if (cd.backstory) {
        html += `<div class="coc-bg-story">${esc(cd.backstory)}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    contentEl.innerHTML = html;
  },

  /** COC技能过滤（全部/已分配/有成功率） */
  _filterCocSkills(filter, btn) {
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.closest('.coc-skills-section').querySelectorAll('.coc-skill-row').forEach(row => {
      const tags = row.dataset.filter || '';
      if (filter === 'all') row.style.display = '';
      else if (filter === 'invested') row.style.display = tags.includes('invested') ? '' : 'none';
      else if (filter === 'nonzero') row.style.display = tags.includes('nonzero') ? '' : 'none';
    });
  },

  /** COC角色编辑模式 */
  _startCocInlineEdit(charId) {
    this._isEditing = true;
    this._showEditToolbar();

    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;
    let note = null;
    for (const unit of mod.board.flowUnits) {
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) break;
    }
    if (!note) return;

    const cd = note.characterData || {};
    const esc = (v) => this._esc(v != null ? v : '');
    const attrs = cd.attributes || {};
    const hp = cd.hp || {}, san = cd.san || {}, luck = cd.luck || {}, mp = cd.mp || {};
    const skills = cd.skills || [];
    const weapons = cd.weapons || [];
    const inventory = cd.inventory || [];
    const insanity = cd.insanityEffects || [];

    let html = '<div class="char-detail-header">';
    html += '<div class="char-detail-edit-area char-coc-edit">';

    // — 基本信息 —
    html += '<div class="coc-edit-block">';
    html += '<div class="ie-row-3">';
    html += `<div class="ie-group"><label>角色名称</label><input type="text" id="cocEd_name" class="ie-input" value="${esc(cd.name)}" placeholder="角色名称"></div>`;
    html += `<div class="ie-group"><label>玩家</label><input type="text" id="cocEd_player" class="ie-input" value="${esc(cd.player)}" placeholder="玩家名"></div>`;
    html += `<div class="ie-group"><label>职业</label><input type="text" id="cocEd_occupation" class="ie-input" value="${esc(cd.occupation)}" placeholder="职业"></div>`;
    html += '</div>';
    html += '<div class="ie-row-4">';
    html += `<div class="ie-group"><label>年龄</label><input type="number" id="cocEd_age" class="ie-input" value="${esc(cd.age)}" placeholder="年龄"></div>`;
    html += `<div class="ie-group"><label>性别</label><input type="text" id="cocEd_gender" class="ie-input" value="${esc(cd.gender)}" placeholder="性别"></div>`;
    html += `<div class="ie-group"><label>时代</label><input type="text" id="cocEd_era" class="ie-input" value="${esc(cd.era)}" placeholder="如 1920s"></div>`;
    html += `<div class="ie-group"><label>出生地</label><input type="text" id="cocEd_birthplace" class="ie-input" value="${esc(cd.birthplace)}" placeholder="出生地"></div>`;
    html += '</div>';
    html += `<div class="ie-group" style="margin-bottom:0"><label>居住地</label><input type="text" id="cocEd_residence" class="ie-input" value="${esc(cd.residence)}" placeholder="居住地"></div>`;
    html += '</div>';

    // — 核心数值 —
    html += '<div class="ie-section-label">核心数值</div>';
    html += '<div class="coc-edit-block">';
    html += '<div class="coc-core-stats-grid">';
    // HP
    html += '<div class="coc-core-stat">';
    html += '<span class="coc-core-stat-label">HP</span>';
    html += '<div class="coc-core-stat-inputs">';
    html += `<input type="number" id="cocEd_hpCur" class="ie-input" value="${hp.current != null ? hp.current : ''}" placeholder="当前">`;
    html += '<span class="coc-core-stat-sep">/</span>';
    html += `<input type="number" id="cocEd_hpMax" class="ie-input" value="${hp.max != null ? hp.max : ''}" placeholder="最大">`;
    html += '</div></div>';
    // SAN
    html += '<div class="coc-core-stat">';
    html += '<span class="coc-core-stat-label">SAN</span>';
    html += '<div class="coc-core-stat-inputs">';
    html += `<input type="number" id="cocEd_sanCur" class="ie-input" value="${san.current != null ? san.current : ''}" placeholder="当前">`;
    html += '<span class="coc-core-stat-sep">/</span>';
    html += `<input type="number" id="cocEd_sanMax" class="ie-input" value="${san.max != null ? san.max : ''}" placeholder="最大">`;
    html += '</div></div>';
    // LUCK
    html += '<div class="coc-core-stat">';
    html += '<span class="coc-core-stat-label">LUCK</span>';
    html += '<div class="coc-core-stat-inputs">';
    html += `<input type="number" id="cocEd_luckCur" class="ie-input" value="${luck.current != null ? luck.current : ''}" placeholder="当前">`;
    html += '<span class="coc-core-stat-sep">/</span>';
    html += `<input type="number" id="cocEd_luckMax" class="ie-input" value="${luck.max != null ? luck.max : 99}" placeholder="最大">`;
    html += '</div></div>';
    // MP
    html += '<div class="coc-core-stat">';
    html += '<span class="coc-core-stat-label">MP</span>';
    html += '<div class="coc-core-stat-inputs">';
    html += `<input type="number" id="cocEd_mpCur" class="ie-input" value="${mp.current != null ? mp.current : ''}" placeholder="当前">`;
    html += '<span class="coc-core-stat-sep">/</span>';
    html += `<input type="number" id="cocEd_mpMax" class="ie-input" value="${mp.max != null ? mp.max : ''}" placeholder="最大">`;
    html += '</div></div>';
    html += '</div>'; // end grid
    // 护甲/移动速度/伤害加值
    html += '<div class="ie-row-3" style="margin-top:10px">';
    html += `<div class="ie-group"><label>护甲</label><input type="number" id="cocEd_armor" class="ie-input" value="${esc(cd.armor)}" placeholder="0"></div>`;
    html += `<div class="ie-group"><label>移动速度</label><input type="number" id="cocEd_mov" class="ie-input" value="${esc(cd.mov)}" placeholder="MOV"></div>`;
    html += `<div class="ie-group" style="margin-bottom:0"><label>伤害加值</label><input type="text" id="cocEd_db" class="ie-input" value="${esc(_cocCalcDB(attrs.str?.value, attrs.siz?.value).db)}" disabled title="由力量+体型自动计算"></div>`;
    html += '</div>';
    html += '</div>'; // end block

    // — 八大属性 —
    html += '<div class="ie-section-label">属性</div>';
    html += '<div class="coc-edit-block">';
    html += '<div class="coc-attr-grid coc-attr-edit-grid">';
    for (const [key, attr] of Object.entries(attrs)) {
      html += `<div class="char-ability-card coc-attr-card coc-attr-edit-card">`;
      html += `<span class="char-ability-label">${esc(attr.name)}</span>`;
      html += `<input type="number" class="ie-input coc-attr-edit-input" data-attr="${key}" value="${attr.value || ''}" placeholder="--" min="0" max="999">`;
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    // — 技能 —
    html += '<div class="ie-section-label">技能 <span style="font-weight:normal;font-size:11px;color:var(--text-muted);">（填写职业/兴趣点数）</span></div>';
    html += '<div class="coc-edit-block">';
    html += '<div class="coc-skill-edit-columns">';
    const half = Math.ceil(skills.length / 2);
    const edCols = [
      skills.slice(0, half),
      skills.slice(half)
    ];
    edCols.forEach(col => {
      html += '<div class="coc-skill-edit-col">';
      col.forEach((sk) => {
        const idx = skills.indexOf(sk);
        const total = (sk.base || 0) + (sk.occ || 0) + (sk.int || 0);
        const isTpl = _isCocTemplateSkill(sk.name);
        const dispName = _cocSkillDisplayName(sk);
        html += `<div class="coc-skill-edit-row">`;
        html += `<span class="coc-skill-edit-name" title="${esc(sk.name)}">${esc(dispName)}</span>`;
        html += `<span class="coc-skill-edit-base">${sk.base}</span>`;
        html += `<input type="number" class="ie-input coc-skill-edit-occ" data-sidx="${idx}" data-field="occ" value="${sk.occ || 0}" placeholder="职" min="0" title="职业点">`;
        html += `<input type="number" class="ie-input coc-skill-edit-int" data-sidx="${idx}" data-field="int" value="${sk.int || 0}" placeholder="趣" min="0" title="兴趣点">`;
        if (isTpl) {
          const baseName = sk.name.replace(/[①②③]$/, '');
          html += `<input type="text" class="ie-input coc-skill-edit-suffix" data-sidx="${idx}" value="${esc(sk.suffix || baseName)}" placeholder="${esc(baseName)}" style="width:56px;font-size:11px;" title="自定义方向，如 短刀、英语">`;
        }
        html += `<span class="coc-skill-edit-total">${total}</span>`;
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>'; // end coc-skill-edit-columns
    html += '</div>'; // end coc-edit-block

    // — 快速录入 —
    html += '<div class="ie-section-label">快速录入</div>';
    html += '<div class="coc-edit-block">';
    html += '<textarea id="cocQuickImportInput" class="ie-textarea" style="min-height:100px;font-size:12px;font-family:monospace;line-height:1.5;" placeholder="粘贴骰娘 .st 录卡指令..."></textarea>';
    html += '<div style="margin-top:8px;text-align:center;">';
    html += '<button type="button" class="ie-add-btn" onclick="CharAlbum._cocQuickImport(&quot;' + charId + '&quot;)">输入</button>';
    html += '</div>';
    html += '<div style="margin-top:6px;font-size:10px;color:var(--text-muted);line-height:1.6;">';
    html += '格式：.st 力量40 敏捷65 意志85 体质50 外貌60 教育70 体型60 智力60 幸运40 hp11 san85 mp17 闪避32 斗殴25 手枪20 ...';
    html += '</div>';
    html += '</div>';

    // — 武器 —
    html += '<div class="ie-section-label">武器</div>';
    html += '<div class="coc-edit-block" id="cocWeaponBlock">';
    html += '<div class="coc-weapon-edit-header"><span>武器名</span><span>技能</span><span>成功率</span><span>伤害</span><span>射程</span><span></span></div>';
    html += '<div id="cocWeaponList">';
    weapons.forEach((w, i) => {
      html += this._cocWeaponRowHtml(i, w);
    });
    html += '</div>';
    html += '<div style="margin-top:8px;text-align:center;"><button type="button" class="ie-add-btn" onclick="CharAlbum._cocAddWeaponRow()">+ 添加武器</button></div>';
    html += '</div>';

    // — 物品 —
    html += '<div class="ie-section-label">物品</div>';
    html += '<div class="coc-edit-block" id="cocInvBlock">';
    html += '<div id="cocInvList">';
    inventory.forEach((item, i) => {
      html += this._cocInventoryRowHtml(i, item);
    });
    html += '</div>';
    html += '<div style="margin-top:8px;text-align:center;"><button type="button" class="ie-add-btn" onclick="CharAlbum._cocAddInventoryRow()">+ 添加物品</button></div>';
    html += '</div>';

    // — 疯狂效果 —
    html += '<div class="ie-section-label">疯狂 / 状态</div>';
    html += '<div class="coc-edit-block" id="cocInsanityBlock">';
    html += '<div id="cocInsanityList">';
    insanity.forEach((eff, i) => {
      html += this._cocInsanityRowHtml(i, eff);
    });
    html += '</div>';
    html += '<div style="margin-top:8px;text-align:center;"><button type="button" class="ie-add-btn" onclick="CharAlbum._cocAddInsanityRow()">+ 添加效果</button></div>';
    html += '</div>';

    // — 背景 —
    html += '<div class="ie-section-label">背景</div>';
    html += '<div class="coc-edit-bg-block">';
    html += '<div class="ie-row ie-row-3">';
    html += `<div class="ie-group"><label>思想与信念</label><input type="text" id="cocEd_ideas" class="ie-input" value="${esc(cd.ideas)}" placeholder="思想与信念"></div>`;
    html += `<div class="ie-group"><label>重要之人</label><input type="text" id="cocEd_importantPeople" class="ie-input" value="${esc(cd.importantPeople)}" placeholder="重要之人"></div>`;
    html += `<div class="ie-group"><label>意义非凡之地</label><input type="text" id="cocEd_meaningfulPlace" class="ie-input" value="${esc(cd.meaningfulPlace)}" placeholder="意义非凡之地"></div>`;
    html += '</div>';
    html += '<div class="ie-row ie-row-3">';
    html += `<div class="ie-group"><label>宝贵之物</label><input type="text" id="cocEd_treasuredItem" class="ie-input" value="${esc(cd.treasuredItem)}" placeholder="宝贵之物"></div>`;
    html += `<div class="ie-group"><label>特质</label><input type="text" id="cocEd_trait" class="ie-input" value="${esc(cd.trait)}" placeholder="性格特质"></div>`;
    html += `<div class="ie-group"><label>恐惧症</label><input type="text" id="cocEd_fear" class="ie-input" value="${esc(cd.fear)}" placeholder="恐惧症"></div>`;
    html += '</div>';
    html += `<div class="ie-group"><label>背景故事</label><textarea id="cocEd_backstory" class="ie-textarea" rows="4" placeholder="背景故事...">${esc(cd.backstory)}</textarea></div>`;
    html += '</div>';

    html += '</div></div>';

    const contentEl = document.getElementById('charDetailContent');
    if (contentEl) contentEl.innerHTML = html;

    // 属性变化时自动更新DB显示
    contentEl?.querySelectorAll('.coc-attr-edit-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const strEl = contentEl.querySelector('[data-attr="str"]');
        const sizEl = contentEl.querySelector('[data-attr="siz"]');
        const dbEl = document.getElementById('cocEd_db');
        if (strEl && sizEl && dbEl) {
          dbEl.value = _cocCalcDB(strEl.value, sizEl.value).db;
        }
        // 更新技能成功率显示
        this._cocUpdateSkillTotals();
      });
    });

    // 技能输入实时更新
    contentEl?.querySelectorAll('.coc-skill-edit-occ, .coc-skill-edit-int').forEach(inp => {
      inp.addEventListener('input', () => this._cocUpdateSkillTotals());
    });
  },

  _cocUpdateSkillTotals() {
    document.querySelectorAll('.coc-skill-edit-row').forEach(row => {
      const baseEl = row.querySelector('.coc-skill-edit-base');
      const occEl = row.querySelector('.coc-skill-edit-occ');
      const intEl = row.querySelector('.coc-skill-edit-int');
      const totalEl = row.querySelector('.coc-skill-edit-total');
      if (baseEl && occEl && intEl && totalEl) {
        const t = (parseInt(baseEl.textContent) || 0) + (parseInt(occEl.value) || 0) + (parseInt(intEl.value) || 0);
        totalEl.textContent = t;
      }
    });
  },

  _cocWeaponRowHtml(idx, w) {
    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };
    return `<div class="coc-weapon-edit-row" data-widx="${idx}">
      <input type="text" class="ie-input coc-we-name" placeholder="武器名" value="${esc(w.name || '')}">
      <input type="text" class="ie-input coc-we-skill" placeholder="技能" value="${esc(w.skill || '')}">
      <input type="number" class="ie-input coc-we-rate" placeholder="%" value="${w.rate != null ? w.rate : ''}">
      <input type="text" class="ie-input coc-we-dmg" placeholder="伤害" value="${esc(w.damage || '')}">
      <input type="text" class="ie-input coc-we-range" placeholder="射程" value="${esc(w.range || '')}">
      <button type="button" class="ie-del-btn" onclick="this.parentElement.remove()" title="删除"><svg width="14" height="14"><use href="#i-trash"/></svg></button>
    </div>`;
  },

  _cocAddWeaponRow() {
    const list = document.getElementById('cocWeaponList');
    if (!list) return;
    const idx = list.children.length;
    list.insertAdjacentHTML('beforeend', this._cocWeaponRowHtml(idx, {}));
  },

  _cocInventoryRowHtml(idx, item) {
    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };
    return `<div class="coc-inv-edit-row" data-iidx="${idx}">
      <input type="text" class="ie-input coc-ie-loc" placeholder="位置" value="${esc(item.location || '')}" style="width:80px;flex-shrink:0;">
      <input type="text" class="ie-input coc-ie-name" placeholder="物品名称" value="${esc(item.name || '')}">
      <button type="button" class="ie-del-btn" onclick="this.parentElement.remove()" title="删除"><svg width="14" height="14"><use href="#i-trash"/></svg></button>
    </div>`;
  },

  _cocAddInventoryRow() {
    const list = document.getElementById('cocInvList');
    if (!list) return;
    const idx = list.children.length;
    list.insertAdjacentHTML('beforeend', this._cocInventoryRowHtml(idx, {}));
  },

  _cocInsanityRowHtml(idx, eff) {
    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };
    return `<div class="coc-insanity-edit-row" data-eidx="${idx}">
      <input type="text" class="ie-input coc-iee-name" placeholder="疯狂效果名称" value="${esc(eff.name || '')}">
      <input type="text" class="ie-input coc-iee-desc" placeholder="描述（可选）" value="${esc(eff.desc || '')}">
      <button type="button" class="ie-del-btn" onclick="this.parentElement.remove()" title="删除"><svg width="14" height="14"><use href="#i-trash"/></svg></button>
    </div>`;
  },

  _cocAddInsanityRow() {
    const list = document.getElementById('cocInsanityList');
    if (!list) return;
    const idx = list.children.length;
    list.insertAdjacentHTML('beforeend', this._cocInsanityRowHtml(idx, {}));
  },

  /** COC快速录入：解析骰娘.st指令文本 */
  _cocQuickImport(charId) {
    const textarea = document.getElementById('cocQuickImportInput');
    if (!textarea) return;
    let text = textarea.value.trim();
    if (!text) { alert('请粘贴骰娘录卡文本'); return; }

    // 去掉.st前缀
    text = text.replace(/^\.st\s*/i, '');

    // 属性别名 → key
    const attrMap = {
      '力量':'str','str':'str','体质':'con','con':'con',
      '体型':'siz','siz':'siz','外貌':'app','app':'app',
      '敏捷':'dex','dex':'dex','智力':'int','int':'int',
      '灵感':'int','意志':'pow','pow':'pow','教育':'edu','edu':'edu'
    };

    // 技能别名 → 标准名
    const skillAlias = {
      '斗殴':'格斗(斗殴)','格斗':'格斗(斗殴)',
      '手枪':'射击(手枪)','射击':'射击(手枪)',
      '计算机':'计算机使用','电脑':'计算机使用',
      '信用':'信用评级','信誉':'信用评级',
      '克苏鲁':'克苏鲁神话','cm':'克苏鲁神话',
      '图书馆':'图书馆使用','开锁':'锁匠','撬锁':'锁匠',
      '驾驶':'汽车驾驶','汽车':'汽车驾驶',
      '导航':'领航','领航':'领航',
      '自然学':'博物学',
      '重型操作':'操作重型机械','重型机械':'操作重型机械',
      '操作重型机械':'操作重型机械','重型':'操作重型机械',
      '潜水':'潜水','读唇':'读唇','催眠':'催眠','炮术':'炮术',
      '母语':'母语','san值':'san','理智值':'san'
    };

    // 解析：提取 (非数字key)(数字value) 对
    const parsed = {};
    const re = /([^\d]+?)(\d{1,3})(?=[^\d]|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = m[1].trim().toLowerCase();
      const val = parseInt(m[2], 10);
      if (!key || isNaN(val)) continue;

      // 属性
      const attrKey = attrMap[key];
      if (attrKey) { parsed['attr_' + attrKey] = val; continue; }

      // 衍生数值
      if (key === 'hp' || key === '体力') { parsed._hp = val; continue; }
      if (key === 'san' || key === 'san值' || key === '理智' || key === '理智值') { parsed._san = val; continue; }
      if (key === 'mp' || key === '魔法') { parsed._mp = val; continue; }
      if (key === '幸运' || key === '运气') { parsed._luck = val; continue; }

      // 技能（先查别名表）
      let skillName = skillAlias[key];
      let skillSuffix = '';
      if (!skillName) {
        // 在默认技能列表中查找匹配
        const origKey = m[1].trim();
        // 检查是否带括号词缀，如 格斗(短刀)
        const suffixMatch = origKey.match(/^(.+)\(([^)]+)\)$/);
        let searchName = origKey;
        if (suffixMatch) {
          const baseName = suffixMatch[1];
          const suffix = suffixMatch[2];
          // 尝试找已有技能：同名+同suffix
          const existingSk = cd.skills && cd.skills.find(s => s.name === baseName && s.suffix === suffix);
          if (existingSk) {
            parsed['sk_' + baseName + '|' + suffix] = val;
            continue;
          }
          // 尝试找空模板技能（如 格斗① 无suffix无occ），跳过已被占用的
          const tpl = COC_DEFAULT_SKILLS.find(ds => {
            if (!ds.name.startsWith(baseName) || !_isCocTemplateSkill(ds.name)) return false;
            // 检查是否已被本次导入占用（key格式：sk_格斗①|短刀）
            const prefix = 'sk_' + ds.name;
            if (Object.keys(parsed).some(pk => pk === prefix || pk.startsWith(prefix + '|'))) return false;
            if (cd.skills) {
              const existing = cd.skills.find(s => s.name === ds.name);
              if (existing && (existing.suffix || (existing.occ || 0) > 0)) return false;
            }
            return true;
          });
          if (tpl) {
            parsed['sk_' + tpl.name + '|' + suffix] = val;
            continue;
          }
          // 无匹配模板，作为普通技能处理
          searchName = origKey;
        }
        for (const ds of COC_DEFAULT_SKILLS) {
          if (ds.name === searchName || ds.name.toLowerCase() === key) {
            skillName = ds.name; break;
          }
        }
        // 模糊匹配：输入是默认技能名的子串，或反过来
        if (!skillName) {
          for (const ds of COC_DEFAULT_SKILLS) {
            if (ds.name.includes(searchName) || searchName.includes(ds.name)) {
              skillName = ds.name; break;
            }
          }
        }
        if (!skillName) skillName = searchName;
      }
      parsed['sk_' + skillName] = val;
    }

    // 写入角色数据
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;
    let note = null;
    for (const unit of mod.board.flowUnits) {
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) break;
    }
    if (!note) return;
    if (!note.characterData) note.characterData = { _coc7: true };
    const cd = note.characterData;
    cd._coc7 = true;

    // 写入属性
    if (!cd.attributes) cd.attributes = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('attr_')) continue;
      const ak = k.slice(5);
      if (!cd.attributes[ak]) cd.attributes[ak] = { name: ak, value: 0 };
      cd.attributes[ak].value = v;
    }

    // 写入衍生数值（保留已有max）
    if (parsed._hp != null) {
      const oldMax = cd.hp && cd.hp.max != null ? cd.hp.max : parsed._hp;
      cd.hp = { current: parsed._hp, max: oldMax };
    }
    if (parsed._san != null) {
      const oldMax = cd.san && cd.san.max != null ? cd.san.max : parsed._san;
      cd.san = { current: parsed._san, max: oldMax };
    }
    if (parsed._mp != null) {
      const oldMax = cd.mp && cd.mp.max != null ? cd.mp.max : parsed._mp;
      cd.mp = { current: parsed._mp, max: oldMax };
    }
    if (parsed._luck != null) {
      const oldMax = cd.luck && cd.luck.max != null ? cd.luck.max : parsed._luck;
      cd.luck = { current: parsed._luck, max: oldMax };
    }

    // 写入技能
    if (!cd.skills) cd.skills = [];
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('sk_')) continue;
      const raw = k.slice(3);
      const pipeIdx = raw.indexOf('|');
      if (pipeIdx >= 0) {
        // 带词缀的模板技能，如 sk_格斗①|短刀
        const skName = raw.slice(0, pipeIdx);
        const suffix = raw.slice(pipeIdx + 1);
        const existing = cd.skills.find(s => s.name === skName);
        if (existing) {
          existing.suffix = suffix;
          existing.occ = Math.max(0, v - (existing.base || 0));
        } else {
          cd.skills.push({ name: skName, base: 0, occ: v, int: 0, growth: false, suffix: suffix });
        }
      } else {
        const skName = raw;
        const existing = cd.skills.find(s => s.name === skName);
        if (existing) {
          // 将导入值视为总值，差值放入occ
          existing.occ = Math.max(0, v - (existing.base || 0));
        } else {
          cd.skills.push({ name: skName, base: 0, occ: v, int: 0, growth: false });
        }
      }
    }

    // 重新渲染编辑表单
    textarea.value = '';
    this._startCocInlineEdit(charId);
  },

  /** 保存COC角色编辑 */
  _saveCocInlineEdit(charId, silent) {
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;

    let note = null, unitIndex = -1;
    for (let ui = 0; ui < mod.board.flowUnits.length; ui++) {
      const unit = mod.board.flowUnits[ui];
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) { unitIndex = ui; break; }
    }
    if (!note) return;

    const gv = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };
    const gn = (id) => {
      const el = document.getElementById(id);
      return el ? parseInt(el.value, 10) : null;
    };

    if (!note.characterData) note.characterData = { _coc7: true };
    const cd = note.characterData;
    cd._coc7 = true;

    // 基本信息
    cd.name = gv('cocEd_name') || '新角色';
    cd.player = gv('cocEd_player');
    cd.occupation = gv('cocEd_occupation');
    cd.age = gv('cocEd_age');
    cd.gender = gv('cocEd_gender');
    cd.era = gv('cocEd_era');
    cd.birthplace = gv('cocEd_birthplace');
    cd.residence = gv('cocEd_residence');

    // 核心数值
    cd.hp = { current: gn('cocEd_hpCur'), max: gn('cocEd_hpMax') };
    cd.san = { current: gn('cocEd_sanCur'), max: gn('cocEd_sanMax') };
    cd.luck = { current: gn('cocEd_luckCur'), max: gn('cocEd_luckMax') };
    cd.mp = { current: gn('cocEd_mpCur'), max: gn('cocEd_mpMax') };
    cd.armor = gn('cocEd_armor') || 0;
    cd.mov = gn('cocEd_mov') || 0;

    // 属性
    if (!cd.attributes) cd.attributes = {};
    document.querySelectorAll('.coc-attr-edit-input').forEach(el => {
      const key = el.dataset.attr;
      if (!key) return;
      if (!cd.attributes[key]) cd.attributes[key] = { name: '', value: 0 };
      cd.attributes[key].value = parseInt(el.value, 10) || 0;
    });

    // 技能
    if (!cd.skills) cd.skills = [];
    document.querySelectorAll('.coc-skill-edit-occ').forEach(el => {
      const idx = parseInt(el.dataset.sidx, 10);
      if (isNaN(idx) || !cd.skills[idx]) return;
      cd.skills[idx].occ = parseInt(el.value, 10) || 0;
    });
    document.querySelectorAll('.coc-skill-edit-int').forEach(el => {
      const idx = parseInt(el.dataset.sidx, 10);
      if (isNaN(idx) || !cd.skills[idx]) return;
      cd.skills[idx].int = parseInt(el.value, 10) || 0;
    });
    // 模板技能词缀
    document.querySelectorAll('.coc-skill-edit-suffix').forEach(el => {
      const idx = parseInt(el.dataset.sidx, 10);
      if (isNaN(idx) || !cd.skills[idx]) return;
      const v = el.value.trim();
      const baseName = (cd.skills[idx].name || '').replace(/[①②③]$/, '');
      if (v && v !== baseName) cd.skills[idx].suffix = v;
      else delete cd.skills[idx].suffix;
    });

    // 武器
    cd.weapons = [];
    document.querySelectorAll('.coc-weapon-edit-row').forEach(row => {
      const name = row.querySelector('.coc-we-name')?.value.trim() || '';
      const skill = row.querySelector('.coc-we-skill')?.value.trim() || '';
      const rate = row.querySelector('.coc-we-rate')?.value.trim();
      const damage = row.querySelector('.coc-we-dmg')?.value.trim() || '';
      const range = row.querySelector('.coc-we-range')?.value.trim() || '';
      if (name || skill || damage) {
        cd.weapons.push({ name, skill, rate: rate !== '' ? parseInt(rate, 10) : null, damage, range });
      }
    });

    // 物品
    cd.inventory = [];
    document.querySelectorAll('.coc-inv-edit-row').forEach(row => {
      const loc = row.querySelector('.coc-ie-loc')?.value.trim() || '';
      const name = row.querySelector('.coc-ie-name')?.value.trim() || '';
      if (name) cd.inventory.push({ location: loc, name });
    });

    // 疯狂效果
    cd.insanityEffects = [];
    document.querySelectorAll('.coc-insanity-edit-row').forEach(row => {
      const name = row.querySelector('.coc-iee-name')?.value.trim() || '';
      const desc = row.querySelector('.coc-iee-desc')?.value.trim() || '';
      if (name) cd.insanityEffects.push({ name, desc });
    });

    // 背景
    cd.ideas = gv('cocEd_ideas');
    cd.importantPeople = gv('cocEd_importantPeople');
    cd.meaningfulPlace = gv('cocEd_meaningfulPlace');
    cd.treasuredItem = gv('cocEd_treasuredItem');
    cd.trait = gv('cocEd_trait');
    cd.fear = gv('cocEd_fear');
    cd.backstory = gv('cocEd_backstory');

    // 同步标题
    note.title = cd.name;

    // 同步战斗追踪器HP（直接更新源便签的combatTracker）
    if (!note.combatTracker) {
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
    }
    const cocMaxHp = cd.hp && cd.hp.max != null ? Number(cd.hp.max) : null;
    const cocCurHp = cd.hp && cd.hp.current != null ? Number(cd.hp.current) : null;
    if (cocMaxHp != null && cocMaxHp > 0) {
      note.combatTracker.maxHp = cocMaxHp;
    }
    if (cocCurHp != null) {
      note.combatTracker.currentHp = cocCurHp;
      if (note.combatTracker.maxHp && note.combatTracker.currentHp > note.combatTracker.maxHp) {
        note.combatTracker.currentHp = note.combatTracker.maxHp;
      }
    }

    StorageManager.scheduleSave();
    this._isEditing = false;
    this._showNormalToolbar();
    this.renderCharacterDetail(charId);
    if (typeof BoardManager !== 'undefined') {
      BoardManager.renderUnitNotes(unitIndex);
      BoardManager._boRenderAll();
    }
    if (!silent) DocEditor.showToast('已保存修改', 'success');
  },

  createNewCharacter() {
    DatabaseManager.openEntryEditor(null, 'characters');
  },

  editCharacter(charId) {
    if (SystemManager.getCurrentSystem() === 'coc7') {
      this._startCocInlineEdit(charId);
    } else if (SystemManager.getCurrentSystem() !== 'dnd5r') {
      this._startCustomInlineEdit(charId);
    } else {
      this._startInlineEdit(charId);
    }
  },

  _showEditToolbar() {
    document.querySelector('.btn-edit-char')?.style.setProperty('display', 'none');
    document.querySelector('.btn-save-char')?.style.setProperty('display', 'inline-flex');
    document.querySelector('.btn-cancel-char')?.style.setProperty('display', 'inline-flex');
  },

  _showNormalToolbar() {
    document.querySelector('.btn-edit-char')?.style.setProperty('display', 'inline-flex');
    document.querySelector('.btn-save-char')?.style.setProperty('display', 'none');
    document.querySelector('.btn-cancel-char')?.style.setProperty('display', 'none');
  },

  _startCustomInlineEdit(charId) {
    this._isEditing = true;
    this._showEditToolbar();

    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;
    let note = null;
    for (const unit of mod.board.flowUnits) {
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) break;
    }
    if (!note) return;

    const cd = note.characterData || {};
    const f = cd.fields || {};
    const tpl = CharTemplateManager.getTemplate();
    const esc = (v) => this._esc(v || '');

    const name = f._name || cd.name || note.title || '新角色';
    const faction = f._faction || cd.faction || 'friendly_npc';
    const hp = f._hp || cd.hp || '';
    const props = f._props || {};
    const sections = f._sections || {};

    let html = '<div class="char-detail-header">';
    html += '<div class="char-detail-edit-area char-custom-edit">';
    html += '<div class="ie-row">';
    html += '<div class="ie-group"><label>角色名称</label>';
    html += `<input type="text" id="ciName" class="ie-input" value="${esc(name)}" maxlength="40" placeholder="角色名称">`;
    html += '</div>';
    html += '<div class="ie-group"><label>阵营</label>';
    html += '<select id="ciFaction" class="ie-input">';
    html += `<option value="pc" ${faction === 'pc' ? 'selected' : ''}>玩家角色</option>`;
    html += `<option value="friendly_npc" ${faction === 'friendly_npc' ? 'selected' : ''}>友方NPC</option>`;
    html += `<option value="enemy_npc" ${faction === 'enemy_npc' ? 'selected' : ''}>敌方NPC</option>`;
    html += '</select></div>';
    html += '<div class="ie-group"><label>HP</label>';
    html += `<input type="text" id="ciHp" class="ie-input" value="${esc(hp)}" placeholder="如：45">`;
    html += '</div></div>';

    if (tpl.properties.length > 0) {
      html += '<div class="ie-group"><label>属性</label>';
      html += '<div class="char-detail-abilities">';
      tpl.properties.forEach(prop => {
        const val = props[prop.id] || '';
        html += `<div class="char-ability-card ie-ability-edit">`;
        html += `<span class="char-ability-label">${esc(prop.name)}</span>`;
        html += `<input type="text" class="ie-ability-input" data-prop="${prop.id}" value="${esc(val)}" placeholder="--">`;
        html += `</div>`;
      });
      html += '</div></div>';
    }

    tpl.sections.forEach(sec => {
      const items = sections[sec.id] || [];
      html += `<div class="char-detail-section"><h3 style="display:flex;align-items:center;gap:10px;">`;
      html += `<span style="display:flex;align-items:center;gap:6px;"><span class="icon"><svg width="14" height="14"><use href="#${sec.icon}"/></svg></span>${esc(sec.name)}</span>`;
      html += `<button type="button" class="ie-add-btn" onclick="CharAlbum._addCustomSectionRow('${sec.id}')" style="margin:0;width:auto;padding:2px 10px;font-size:11px;flex-shrink:0;">+ 添加</button>`;
      html += `</h3>`;
      html += `<div class="char-detail-list ie-section-list" data-section="${sec.id}">`;
      items.forEach((it, idx) => {
        html += this._customSectionItemHtml(sec.id, idx, it.name, it.desc);
      });
      html += '</div></div>';
    });

    html += '</div></div>';

    const contentEl = document.getElementById('charDetailContent');
    if (contentEl) contentEl.innerHTML = html;
  },

  _customSectionItemHtml(secId, idx, name, desc) {
    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };
    return `<div class="char-detail-item ie-section-item" data-idx="${idx}">
      <div class="ie-section-row">
        <input type="text" class="ie-input ie-section-name" placeholder="名称" value="${esc(name || '')}">
        <button type="button" class="ie-del-btn" onclick="CharAlbum._removeCustomSectionRow('${secId}', ${idx})" title="删除">
          <svg width="14" height="14"><use href="#i-trash"/></svg>
        </button>
      </div>
      <textarea class="ie-textarea ie-section-desc" placeholder="描述（可选）" rows="2">${esc(desc || '')}</textarea>
    </div>`;
  },

  _addCustomSectionRow(secId) {
    const list = document.querySelector(`.ie-section-list[data-section="${secId}"]`);
    if (!list) return;
    const items = list.querySelectorAll('.ie-section-item');
    const newIdx = items.length;
    list.insertAdjacentHTML('beforeend', this._customSectionItemHtml(secId, newIdx, '', ''));
  },

  _removeCustomSectionRow(secId, idx) {
    const list = document.querySelector(`.ie-section-list[data-section="${secId}"]`);
    if (!list) return;
    const item = list.querySelector(`.ie-section-item[data-idx="${idx}"]`);
    if (item) item.remove();
  },

  _saveCustomInlineEdit(charId, silent) {
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;

    let note = null, unitIndex = -1;
    for (let ui = 0; ui < mod.board.flowUnits.length; ui++) {
      const unit = mod.board.flowUnits[ui];
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) { unitIndex = ui; break; }
    }
    if (!note) return;

    const gv = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const tpl = CharTemplateManager.getTemplate();

    const name = gv('ciName') || '新角色';
    const faction = gv('ciFaction') || 'friendly_npc';
    const hp = gv('ciHp');

    const props = {};
    document.querySelectorAll('.ie-ability-input').forEach(el => {
      const propId = el.dataset.prop;
      if (propId) props[propId] = el.value.trim();
    });

    const sections = {};
    tpl.sections.forEach(sec => {
      const list = document.querySelector(`.ie-section-list[data-section="${sec.id}"]`);
      if (!list) { sections[sec.id] = []; return; }
      const items = [];
      list.querySelectorAll('.ie-section-item').forEach(item => {
        const n = item.querySelector('.ie-section-name')?.value.trim() || '';
        const d = item.querySelector('.ie-section-desc')?.value.trim() || '';
        if (n || d) items.push({ name: n, desc: d });
      });
      sections[sec.id] = items;
    });

    if (!note.characterData) note.characterData = {};
    if (!note.characterData.fields) note.characterData.fields = {};

    note.characterData.name = name;
    note.characterData.faction = faction;
    note.characterData.hp = hp;
    note.characterData.fields._name = name;
    note.characterData.fields._faction = faction;
    note.characterData.fields._hp = hp;
    note.characterData.fields._props = props;
    note.characterData.fields._sections = sections;

    if (name) note.title = name;

    // 同步战斗追踪器HP（直接更新源便签的combatTracker）
    if (!note.combatTracker) {
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
    }
    const customMaxHp = parseInt(hp, 10);
    if (!isNaN(customMaxHp) && customMaxHp > 0) {
      const oldMaxHp = note.combatTracker.maxHp;
      note.combatTracker.maxHp = customMaxHp;
      if (customMaxHp !== oldMaxHp) {
        note.combatTracker.currentHp = customMaxHp;
      }
    }

    StorageManager.scheduleSave();
    this._isEditing = false;
    this._showNormalToolbar();
    this.renderCharacterDetail(charId);
    if (typeof BoardManager !== 'undefined') {
      BoardManager.renderUnitNotes(unitIndex);
      BoardManager._boRenderAll();
    }
    if (!silent) DocEditor.showToast('已保存修改', 'success');
  },

  _startInlineEdit(charId) {
    this._isEditing = true;
    this._showEditToolbar();
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;

    // 找到便签
    let note = null, unitIndex = -1;
    for (let ui = 0; ui < mod.board.flowUnits.length; ui++) {
      const unit = mod.board.flowUnits[ui];
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) { unitIndex = ui; break; }
    }
    if (!note) return;

    const cd = note.characterData || {};
    const contentEl = document.getElementById('charDetailContent');
    if (!contentEl) return;

    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };

    let html = '<div class="char-inline-edit">';

    // 基础信息
    html += '<div class="ie-field-group cols2">';
    html += `<div class="ie-field"><label>中文名称</label><input id="ieName" value="${esc(cd.name || '')}"></div>`;
    html += `<div class="ie-field"><label>英文名称</label><input id="ieEnName" value="${esc(cd.enName || '')}"></div>`;
    html += '</div>';

    html += '<div class="ie-field-group cols4">';
    html += `<div class="ie-field"><label>体型</label><input id="ieSize" value="${esc(cd.size || '')}" placeholder="大型"></div>`;
    html += `<div class="ie-field"><label>类型</label><input id="ieType" value="${esc(cd.type || '')}" placeholder="异怪"></div>`;
    html += `<div class="ie-field"><label>阵营描述</label><input id="ieAlignment" value="${esc(cd.alignment || '')}" placeholder="混乱邪恶"></div>`;
    html += `<div class="ie-field"><label>角色分类</label><select id="ieFaction">`;
    html += `<option value="pc"${(cd.faction || 'pc') === 'pc' ? ' selected' : ''}>玩家角色</option>`;
    html += `<option value="friendly_npc"${cd.faction === 'friendly_npc' ? ' selected' : ''}>友方NPC</option>`;
    html += `<option value="enemy_npc"${cd.faction === 'enemy_npc' ? ' selected' : ''}>敌方NPC</option>`;
    html += `</select></div>`;
    html += '</div>';

    // 战斗数据
    html += '<div class="ie-field-group cols4">';
    html += `<div class="ie-field"><label>AC</label><input id="ieAC" value="${esc(cd.ac || '')}"></div>`;
    html += `<div class="ie-field"><label>先攻</label><input id="ieInitiative" value="${esc(cd.initiative || '')}"></div>`;
    html += `<div class="ie-field"><label>HP</label><input id="ieHP" value="${esc(cd.hp || '')}"></div>`;
    html += `<div class="ie-field"><label>速度</label><input id="ieSpeed" value="${esc(cd.speed || '')}"></div>`;
    html += '</div>';

    // 六属性
    html += '<div class="ie-field-group cols6">';
    const abLabels = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
    for (const [key, label] of Object.entries(abLabels)) {
      html += `<div class="ie-field"><label>${label}</label><input id="ie${key.toUpperCase()}" value="${esc(cd[key] || '')}" style="text-align:center"></div>`;
    }
    html += '</div>';

    // 技能/免疫/抗性等
    html += '<div class="ie-field-group cols3">';
    html += `<div class="ie-field"><label>技能</label><input id="ieSkill" value="${esc(cd.skill || '')}"></div>`;
    html += `<div class="ie-field"><label>免疫</label><input id="ieImmune" value="${esc(cd.immune || '')}"></div>`;
    html += `<div class="ie-field"><label>抗性</label><input id="ieResistant" value="${esc(cd.resistant || '')}"></div>`;
    html += '</div>';

    html += '<div class="ie-field-group cols3">';
    html += `<div class="ie-field"><label>感官</label><input id="ieSenses" value="${esc(cd.senses || '')}"></div>`;
    html += `<div class="ie-field"><label>语言</label><input id="ieLanguages" value="${esc(cd.languages || '')}"></div>`;
    html += `<div class="ie-field"><label>CR</label><input id="ieCR" value="${esc(cd.cr || '')}"></div>`;
    html += '</div>';

    // 武器
    html += '<div class="ie-section-title">武器</div>';
    html += '<div id="ieWeaponsList">';
    let weapons = [];
    try { weapons = JSON.parse((cd.fields && cd.fields['_weapons']) || '[]'); } catch(e) {}
    weapons.forEach((w, i) => {
      html += `<div class="ie-weapon-card">
        <div class="ie-weapon-header"><input class="ie-weapon-name" value="${esc(w.name || '')}" placeholder="武器名称"><button class="ie-array-del" onclick="this.parentElement.parentElement.remove()">×</button></div>
        <div class="ie-weapon-grid">
          <div class="ie-weapon-field"><label>特性</label><input class="ie-weapon-traits" value="${esc(w.traits || '')}" placeholder="多用(1d10)"></div>
          <div class="ie-weapon-field"><label>攻击骰</label><input class="ie-weapon-attack" value="${esc(w.attack || '20d+0')}" placeholder="20d+0"></div>
          <div class="ie-weapon-field"><label>伤害骰</label><input class="ie-weapon-damage" value="${esc(w.damage || '')}" placeholder="1d8"></div>
          <div class="ie-weapon-field"><label>类型</label><input class="ie-weapon-type" value="${esc(w.type || '')}" placeholder="钝击"></div>
          <div class="ie-weapon-field"><label>精通</label><input class="ie-weapon-mastery" value="${esc(w.mastery || '')}" placeholder="推离"></div>
          <div class="ie-weapon-field"><label>重量</label><input class="ie-weapon-weight" value="${esc(w.weight || '')}" placeholder="2LB"></div>
          <div class="ie-weapon-field ie-weapon-attuned"><label>同调</label><input type="checkbox" class="ie-weapon-attuned-box" ${w.attuned ? 'checked' : ''}></div>
        </div>
      </div>`;
    });
    html += '</div>';
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieAddWeapon()">+ 添加武器</button>`;

    // 特质
    html += '<div class="ie-section-title">特质</div>';
    html += '<div id="ieTraitsList">';
    const traits = cd.traits || [];
    traits.forEach((t, i) => {
      html += `<div class="ie-array-row"><input class="ie-array-title" value="${esc(t.title || '')}" placeholder="特质名"><input class="ie-array-desc" value="${esc(t.desc || '')}" placeholder="描述"><button class="ie-array-del" onclick="this.parentElement.remove()">×</button></div>`;
    });
    html += '</div>';
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieAddArray('ieTraitsList','特质名','描述')">+ 添加特质</button>`;

    // 动作
    html += '<div class="ie-section-title">动作</div>';
    html += '<div id="ieActionsList">';
    const actions = cd.actions || [];
    actions.forEach((a, i) => {
      html += `<div class="ie-array-row"><input class="ie-array-title" value="${esc(a.title || '')}" placeholder="动作名"><input class="ie-array-desc" value="${esc(a.desc || '')}" placeholder="描述"><button class="ie-array-del" onclick="this.parentElement.remove()">×</button></div>`;
    });
    html += '</div>';
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieAddArray('ieActionsList','动作名','描述')">+ 添加动作</button>`;

    // 物品
    html += '<div class="ie-section-title">物品</div>';
    html += '<div id="ieItemsList">';
    let items = [];
    try { items = JSON.parse((cd.fields && cd.fields['_items']) || '[]'); } catch(e) {}
    items.forEach((it, i) => {
      html += `<div class="ie-array-row"><div class="ie-item-suggest-wrap"><input class="ie-array-title ie-item-name" value="${esc(it.name || '')}" placeholder="搜索物品名..." oninput="CharAlbum._ieSearchItems(this)" onfocus="CharAlbum._ieSearchItems(this)" onblur="setTimeout(()=>CharAlbum._ieHideSuggest(this), 200)"><div class="ie-item-suggest"></div></div><input class="ie-array-count" value="${esc(String(it.count || 1))}" placeholder="数量"><input class="ie-array-desc" value="${esc(it.desc || '')}" placeholder="描述"><button class="ie-array-del" onclick="this.parentElement.remove()">×</button></div>`;
    });
    html += '</div>';
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieAddItem()">+ 添加物品</button>`;

    // 法术
    html += '<div class="ie-section-title">法术</div>';
    html += '<div id="ieSpellsList">';
    let spells = [];
    try { spells = JSON.parse((cd.fields && cd.fields['_spells']) || '[]'); } catch(e) {}
    spells.forEach(sp => {
      html += this._buildSpellCardHTML(sp);
    });
    html += '</div>';
    html += '<div class="ie-spell-bulk-add" style="display:flex;align-items:center;gap:4px;margin-top:4px;">';
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieAddSpell()">+ 添加法术</button>`;
    html += `<button class="ie-add-btn" onclick="CharAlbum._toggleBulkSpellInput()" id="ieBulkSpellBtn">快速添加多个法术</button>`;
    html += '<div id="ieBulkSpellInputWrap" style="display:none;flex:1;gap:4px;">';
    html += `<input type="text" id="ieBulkSpellInput" placeholder="输入法术名，用逗号分隔（如：侦测魔法detect magic，羽落术feather fall）" style="flex:1;padding:4px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);">`;
    html += `<button class="ie-add-btn" onclick="CharAlbum._ieBulkAddSpells()">确认添加</button>`;
    html += '</div></div>';

    // 其他备注
    html += '<div class="ie-section-title">其他</div>';
    html += `<div class="ie-field"><textarea id="ieOther" rows="3">${esc(cd.other || '')}</textarea></div>`;



    html += '</div>';
    contentEl.innerHTML = html;
  },

  _ieAddArray(listId, ph1, ph2) {
    const list = document.getElementById(listId);
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ie-array-row';
    row.innerHTML = `<input class="ie-array-title" placeholder="${ph1}"><input class="ie-array-desc" placeholder="${ph2}"><button class="ie-array-del" onclick="this.parentElement.remove()">×</button>`;
    list.appendChild(row);
  },

  _ieAddItem() {
    const list = document.getElementById('ieItemsList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'ie-array-row';
    row.innerHTML = '<div class="ie-item-suggest-wrap"><input class="ie-array-title ie-item-name" placeholder="搜索物品名..." oninput="CharAlbum._ieSearchItems(this)" onfocus="CharAlbum._ieSearchItems(this)" onblur="setTimeout(()=>CharAlbum._ieHideSuggest(this), 200)"><div class="ie-item-suggest"></div></div><input class="ie-array-count" value="1" placeholder="数量" style="width:50px;text-align:center"><input class="ie-array-desc" placeholder="描述"><button class="ie-array-del" onclick="this.parentElement.remove()">×</button>';
    list.appendChild(row);
  },

  _ieAddWeapon() {
    const list = document.getElementById('ieWeaponsList');
    if (!list) return;
    const card = document.createElement('div');
    card.className = 'ie-weapon-card';
    card.innerHTML = `<div class="ie-weapon-header"><input class="ie-weapon-name" placeholder="武器名称"><button class="ie-array-del" onclick="this.parentElement.parentElement.remove()">×</button></div>
      <div class="ie-weapon-grid">
        <div class="ie-weapon-field"><label>特性</label><input class="ie-weapon-traits" placeholder="多用(1d10)"></div>
        <div class="ie-weapon-field"><label>攻击骰</label><input class="ie-weapon-attack" value="20d+0" placeholder="20d+0"></div>
        <div class="ie-weapon-field"><label>伤害骰</label><input class="ie-weapon-damage" placeholder="1d8"></div>
        <div class="ie-weapon-field"><label>类型</label><input class="ie-weapon-type" placeholder="钝击"></div>
        <div class="ie-weapon-field"><label>精通</label><input class="ie-weapon-mastery" placeholder="推离"></div>
        <div class="ie-weapon-field"><label>重量</label><input class="ie-weapon-weight" placeholder="2LB"></div>
        <div class="ie-weapon-field ie-weapon-attuned"><label>同调</label><input type="checkbox" class="ie-weapon-attuned-box"></div>
      </div>`;
    list.appendChild(card);
  },

  _ieSearchItems(input) {
    const q = input.value.trim().toLowerCase();
    const suggest = input.parentElement.querySelector('.ie-item-suggest');
    if (!suggest) return;
    if (q.length < 1) { suggest.classList.remove('show'); return; }
    
    // 搜索物品库
    const results = [];
    if (typeof ITEM_DATABASE !== 'undefined') {
      for (const item of ITEM_DATABASE) {
        if (item.name.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q))) {
          results.push(item);
        }
      }
    }
    
    if (results.length === 0) {
      suggest.innerHTML = '<div class="ie-item-suggest-item" style="color:var(--text-muted);cursor:default">无匹配结果，可手动输入</div>';
    } else {
      suggest.innerHTML = results.map((r, i) => 
        `<div class="ie-item-suggest-item" onmousedown="event.preventDefault();CharAlbum._ieSelectItem(${i}, this)" data-idx="${i}">
          <span class="suggest-name">${this._escs(r.name)}</span>
          <span class="suggest-cat">${this._escs(r.category || '')}</span>
        </div>`
      ).join('');
      
      // 存储搜索结果用于选择
      suggest._results = results;
    }
    suggest.classList.add('show');
  },

  _escs(v) {
    const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML;
  },

  _ieSelectItem(idx, el) {
    const suggest = el.parentElement;
    const results = suggest._results || [];
    const item = results[idx];
    if (!item) return;
    const row = suggest.closest('.ie-array-row');
    if (!row) return;
    const nameInput = row.querySelector('.ie-item-name');
    const descInput = row.querySelector('.ie-array-desc');
    if (nameInput) nameInput.value = item.name;
    if (descInput) descInput.value = item.description || '';
    suggest.classList.remove('show');
  },

  _ieHideSuggest(input) {
    const suggest = input.parentElement.querySelector('.ie-item-suggest');
    if (suggest) suggest.classList.remove('show');
  },

  _ieAddSpell() {
    const list = document.getElementById('ieSpellsList');
    if (!list) return;
    const div = document.createElement('div');
    div.innerHTML = this._buildSpellCardHTML({});
    list.appendChild(div.firstElementChild);
  },

  _toggleBulkSpellInput() {
    const wrap = document.getElementById('ieBulkSpellInputWrap');
    const btn = document.getElementById('ieBulkSpellBtn');
    if (!wrap || !btn) return;
    const isHidden = wrap.style.display === 'none';
    wrap.style.display = isHidden ? 'flex' : 'none';
    btn.textContent = isHidden ? '收起快速添加' : '快速添加多个法术';
    if (isHidden) {
      const input = document.getElementById('ieBulkSpellInput');
      if (input) input.focus();
    }
  },

  _ieBulkAddSpells() {
    const input = document.getElementById('ieBulkSpellInput');
    const list = document.getElementById('ieSpellsList');
    if (!input || !list) return;

    const text = input.value.trim();
    if (!text) return;

    const parts = text.split(/[,，、]/).map(p => p.trim()).filter(p => p);
    let addedCount = 0;

    parts.forEach(part => {
      if (!part) return;

      let foundSpell = null;
      if (typeof SPELL_DATABASE !== 'undefined') {
        const cleanPart = part.toLowerCase().replace(/\*/g, '').trim();
        foundSpell = SPELL_DATABASE.find(sp => 
          sp.name.toLowerCase().includes(cleanPart) ||
          cleanPart.includes(sp.name.toLowerCase())
        );
      }

      if (foundSpell) {
        const div = document.createElement('div');
        div.innerHTML = this._buildSpellCardHTML(foundSpell);
        list.appendChild(div.firstElementChild);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      input.value = '';
      this._toggleBulkSpellInput();
    }
  },

  _buildSpellCardHTML(sp) {
    const esc = (v) => { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; };
    const spLvl = sp.level !== undefined ? String(sp.level) : '';
    return `<div class="ie-spell-card">
      <div class="ie-spell-top">
        <div class="ie-item-suggest-wrap" style="flex:1;min-width:100px">
          <input class="ie-spell-name" value="${esc(sp.name || '')}" placeholder="搜索法术名..." oninput="CharAlbum._ieSearchSpells(this)" onfocus="CharAlbum._ieSearchSpells(this)" onblur="setTimeout(()=>CharAlbum._ieHideSuggest(this), 200)">
          <div class="ie-item-suggest"></div>
        </div>
        <input class="ie-spell-level" value="${esc(spLvl)}" placeholder="环位(0-9)" style="width:55px;text-align:center">
        <input class="ie-spell-school" value="${esc(sp.school || '')}" placeholder="学派" style="width:50px;text-align:center">
        <label class="ie-check"><input type="checkbox" class="ie-spell-ritual"${sp.ritual ? ' checked' : ''}> 仪式</label>
        <label class="ie-check"><input type="checkbox" class="ie-spell-conc"${sp.concentration ? ' checked' : ''}> 专注</label>
        <input class="ie-spell-ctime" value="${esc(sp.castingTime || '')}" placeholder="施法时间" style="width:65px">
        <input class="ie-spell-dur" value="${esc(sp.duration || '')}" placeholder="持续时间" style="width:70px">
        <button class="ie-array-del" onclick="this.closest('.ie-spell-card').remove()">×</button>
        <span class="ie-spell-toggle" onclick="this.closest('.ie-spell-card').classList.toggle('expanded')" title="展开详情">▼</span>
      </div>
      <div class="ie-spell-extra">
        <textarea class="ie-spell-desc" placeholder="法术描述" rows="2">${esc(sp.desc || '')}</textarea>
        <div class="ie-spell-bottom">
          <input class="ie-spell-source" value="${esc(sp.source || '')}" placeholder="出处" style="width:100px">
          <input class="ie-spell-classes" value="${esc(sp.classes || '')}" placeholder="法表职业" style="flex:1">
        </div>
      </div>
    </div>`;
  },

  _ieSearchSpells(input) {
    const q = input.value.trim().toLowerCase();
    const suggest = input.parentElement.querySelector('.ie-item-suggest');
    if (!suggest) return;
    if (q.length < 1) { suggest.classList.remove('show'); return; }

    const results = [];
    if (typeof SPELL_DATABASE !== 'undefined') {
      for (const sp of SPELL_DATABASE) {
        if (sp.name.toLowerCase().includes(q)) {
          results.push(sp);
        }
      }
    }

    if (results.length === 0) {
      suggest.innerHTML = '<div class="ie-item-suggest-item" style="color:var(--text-muted);cursor:default">无匹配结果，可手动输入</div>';
    } else {
      suggest.innerHTML = results.map((r, i) => 
        `<div class="ie-item-suggest-item" onmousedown="event.preventDefault();CharAlbum._ieSelectSpell(${i}, this)" data-idx="${i}">
          <span class="suggest-name">${this._escs(r.name)}</span>
          <span class="suggest-cat">${r.level===0?'戏法':r.level+'环'} ${this._escs(r.school || '')}</span>
        </div>`
      ).join('');
      suggest._results = results;
    }
    suggest.classList.add('show');
  },

  _ieSelectSpell(idx, el) {
    const suggest = el.parentElement;
    const results = suggest._results || [];
    const spell = results[idx];
    if (!spell) return;
    const card = suggest.closest('.ie-spell-card');
    if (!card) return;
    card.querySelector('.ie-spell-name') && (card.querySelector('.ie-spell-name').value = spell.name);
    card.querySelector('.ie-spell-level') && (card.querySelector('.ie-spell-level').value = spell.level);
    card.querySelector('.ie-spell-school') && (card.querySelector('.ie-spell-school').value = spell.school || '');
    const rcb = card.querySelector('.ie-spell-ritual'); if (rcb) rcb.checked = spell.ritual || false;
    const ccb = card.querySelector('.ie-spell-conc'); if (ccb) ccb.checked = spell.concentration || false;
    card.querySelector('.ie-spell-ctime') && (card.querySelector('.ie-spell-ctime').value = spell.castingTime || '');
    card.querySelector('.ie-spell-dur') && (card.querySelector('.ie-spell-dur').value = spell.duration || '');
    card.querySelector('.ie-spell-desc') && (card.querySelector('.ie-spell-desc').value = spell.description || '');
    card.querySelector('.ie-spell-source') && (card.querySelector('.ie-spell-source').value = spell.source || '');
    card.querySelector('.ie-spell-classes') && (card.querySelector('.ie-spell-classes').value = spell.classes || '');
    card.classList.add('expanded');
    suggest.classList.remove('show');
  },

  /* 退出角色图鉴页前检查编辑状态 */
  _attemptLeavePage(targetPage, isGoHome) {
    if (!this._isEditing) {
      if (isGoHome) App.goHome();
      else UIRender.switchPage(targetPage);
      return;
    }
    this._pendingNav = { targetPage, isGoHome };
    document.getElementById('charLeaveConfirm').classList.add('active');
  },

  /* 取消退出，留在当前页面 */
  _leaveCancel() {
    document.getElementById('charLeaveConfirm').classList.remove('active');
    this._pendingNav = null;
    this._pendingCharId = null;
  },

  /* 确认退出：保存或不保存 */
  _leaveConfirm(doSave) {
    document.getElementById('charLeaveConfirm').classList.remove('active');

    if (doSave) {
      this._saveInlineEdit(this._currentCharacterId, true);
    } else {
      this._cancelEdit(this._currentCharacterId, true);
    }

    // 优先处理页面导航
    const nav = this._pendingNav;
    this._pendingNav = null;
    if (nav) {
      if (nav.isGoHome) App.goHome();
      else UIRender.switchPage(nav.targetPage);
      return;
    }

    // 处理角色卡切换
    const charId = this._pendingCharId;
    this._pendingCharId = null;
    if (charId) {
      this.selectCharacter(charId);
    }
  },

  _cancelEdit(charId, silent) {
    this._isEditing = false;
    this._showNormalToolbar();
    if (!silent) {
      this.renderCharacterDetail(charId);
    }
  },

  _saveInlineEdit(charId, silent) {
    if (SystemManager.getCurrentSystem() === 'coc7') {
      this._saveCocInlineEdit(charId, silent);
      return;
    }
    if (SystemManager.getCurrentSystem() !== 'dnd5r') {
      this._saveCustomInlineEdit(charId, silent);
      return;
    }
    const mod = AppState.currentModule;
    if (!mod || !mod.board || !mod.board.flowUnits) return;

    // 找到便签
    let note = null, unitIndex = -1;
    for (let ui = 0; ui < mod.board.flowUnits.length; ui++) {
      const unit = mod.board.flowUnits[ui];
      if (!unit.notes) continue;
      note = unit.notes.find(n => n.id === charId);
      if (note) { unitIndex = ui; break; }
    }
    if (!note) return;

    const gv = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    // 收集特质
    const traits = [];
    document.querySelectorAll('#ieTraitsList .ie-array-row').forEach(row => {
      const title = row.querySelector('.ie-array-title')?.value.trim() || '';
      const desc = row.querySelector('.ie-array-desc')?.value.trim() || '';
      if (title || desc) traits.push({ title, desc });
    });

    // 收集动作
    const actions = [];
    document.querySelectorAll('#ieActionsList .ie-array-row').forEach(row => {
      const title = row.querySelector('.ie-array-title')?.value.trim() || '';
      const desc = row.querySelector('.ie-array-desc')?.value.trim() || '';
      if (title || desc) actions.push({ title, desc });
    });

    // 收集物品
    const items = [];
    document.querySelectorAll('#ieItemsList .ie-array-row').forEach(row => {
      const name = row.querySelector('.ie-array-title')?.value.trim() || '';
      const count = parseInt(row.querySelector('.ie-array-count')?.value.trim()) || 1;
      const desc = row.querySelector('.ie-array-desc')?.value.trim() || '';
      if (name) items.push({ name, count, desc });
    });

    // 收集武器
    const weapons = [];
    document.querySelectorAll('#ieWeaponsList .ie-weapon-card').forEach(card => {
      const name = card.querySelector('.ie-weapon-name')?.value.trim() || '';
      const traits = card.querySelector('.ie-weapon-traits')?.value.trim() || '';
      const attack = card.querySelector('.ie-weapon-attack')?.value.trim() || '';
      const damage = card.querySelector('.ie-weapon-damage')?.value.trim() || '';
      const type = card.querySelector('.ie-weapon-type')?.value.trim() || '';
      const mastery = card.querySelector('.ie-weapon-mastery')?.value.trim() || '';
      const weight = card.querySelector('.ie-weapon-weight')?.value.trim() || '';
      const attuned = card.querySelector('.ie-weapon-attuned-box')?.checked || false;
      if (name) weapons.push({ name, traits, attack, damage, type, mastery, weight, attuned });
    });

    // 收集法术
    const spells = [];
    document.querySelectorAll('#ieSpellsList .ie-spell-card').forEach(card => {
      const name = card.querySelector('.ie-spell-name')?.value.trim() || '';
      const level = parseInt(card.querySelector('.ie-spell-level')?.value.trim()) || 0;
      const school = card.querySelector('.ie-spell-school')?.value.trim() || '';
      const ritual = card.querySelector('.ie-spell-ritual')?.checked || false;
      const concentration = card.querySelector('.ie-spell-conc')?.checked || false;
      const castingTime = card.querySelector('.ie-spell-ctime')?.value.trim() || '';
      const duration = card.querySelector('.ie-spell-dur')?.value.trim() || '';
      const desc = card.querySelector('.ie-spell-desc')?.value.trim() || '';
      const source = card.querySelector('.ie-spell-source')?.value.trim() || '';
      const classes = card.querySelector('.ie-spell-classes')?.value.trim() || '';
      if (name) spells.push({ name, level, school, ritual, concentration, castingTime, duration, desc, source, classes });
    });
    spells.sort((a, b) => a.level - b.level);

    // 构建 characterData（扁平 + fields 兼容）
    const cd = {
      name: gv('ieName'),
      enName: gv('ieEnName'),
      size: gv('ieSize'),
      type: gv('ieType'),
      alignment: gv('ieAlignment'),
      faction: gv('ieFaction') || 'pc',
      ac: gv('ieAC'),
      initiative: gv('ieInitiative'),
      hp: gv('ieHP'),
      speed: gv('ieSpeed'),
      str: gv('ieSTR'),
      dex: gv('ieDEX'),
      con: gv('ieCON'),
      int: gv('ieINT'),
      wis: gv('ieWIS'),
      cha: gv('ieCHA'),
      skill: gv('ieSkill'),
      immune: gv('ieImmune'),
      resistant: gv('ieResistant'),
      senses: gv('ieSenses'),
      languages: gv('ieLanguages'),
      cr: gv('ieCR'),
      traits,
      actions,
      other: gv('ieOther')
    };

    // 保留 items 和 spells 到 fields
    if (!note.characterData.fields) note.characterData.fields = {};
    if (items.length > 0) {
      note.characterData.fields['_items'] = JSON.stringify(items);
    } else {
      delete note.characterData.fields['_items'];
    }
    if (weapons.length > 0) {
      note.characterData.fields['_weapons'] = JSON.stringify(weapons);
    } else {
      delete note.characterData.fields['_weapons'];
    }
    if (spells.length > 0) {
      note.characterData.fields['_spells'] = JSON.stringify(spells);
    } else {
      delete note.characterData.fields['_spells'];
    }

    note.characterData = Object.assign(note.characterData, cd);
    if (note.characterData.name) note.title = note.characterData.name;

    // 确保战斗追踪器已初始化
    if (!note.combatTracker) {
      note.combatTracker = { currentHp: null, maxHp: null, tempHp: 0, statuses: [], deathSaves: { success: 0, failure: 0 }, log: [], _collapsed: false };
    }
    const oldMaxHp = note.combatTracker.maxHp;
    const newMaxHp = BoardManager._parseMaxHp(note.characterData);
    if (newMaxHp && newMaxHp !== oldMaxHp) {
      note.combatTracker.maxHp = newMaxHp;
      note.combatTracker.currentHp = newMaxHp;
    }

    this._isEditing = false;
    this._showNormalToolbar();
    StorageManager.scheduleSave();
    // 刷新带团板画布
    BoardManager.renderUnitNotes(unitIndex);
    // 同步战斗模块显示（HP变化需反映到战斗叠加层）
    BoardManager._boRenderAll();
    
    if (!silent) {
      // 刷新角色列表和图鉴详情
      this.renderCharacterList();
      this.renderCharacterDetail(charId);
    }
  },

  deleteCharacter(charId) {
    if (!confirm('确定删除该角色？')) return;
    
    const mod = AppState.currentModule;
    let found = false;
    let deletedUnitIndex = -1;
    mod.board.flowUnits.forEach((unit, idx) => {
      if (!unit.notes) return;
      const noteIdx = unit.notes.findIndex(n => n.id === charId);
      if (noteIdx >= 0) {
        unit.notes.splice(noteIdx, 1);
        found = true;
        deletedUnitIndex = idx;
      }
    });

    if (found) {
      StorageManager.scheduleSave();
      if (deletedUnitIndex >= 0) {
        BoardManager.renderUnitNotes(deletedUnitIndex);
      }
      this._currentCharacterId = null;
      this.renderCharacterList();
      this.renderCharacterDetail(null);
    }
  },

  _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};

/* ==========================================================================
 * 世界时钟模块
 * 带团板浮动时钟组件，支持时段可视化、快捷预设、时间备注日志
 * 数据存储在 board.worldTime 中，随存档自动保存
 * ========================================================================== */
const WorldClock = {

  _prevDigits: ['0', '8', '0', '0'],
  _expanded: false,
  _animatingSlots: new Set(),
  _lastAdjustTime: 0,

  /* 时段定义 */
  PERIODS: [
    { key: 'deepnight', name: '深夜', icon: 'i-moon',    start: 0,    end: 360  },
    { key: 'morning',   name: '黎明', icon: 'i-sunrise', start: 360,  end: 600  },
    { key: 'midday',    name: '正午', icon: 'i-sun',     start: 600,  end: 780  },
    { key: 'afternoon', name: '午后', icon: 'i-sun',     start: 780,  end: 1080 },
    { key: 'dusk',      name: '黄昏', icon: 'i-sunset',  start: 1080, end: 1260 },
    { key: 'night',     name: '夜晚', icon: 'i-moon',    start: 1260, end: 1440 }
  ],

  /* 初始化 */
  init() {
    const data = this._getData();
    this._prevDigits = this._timeToDigits(data.time);
    this._renderDigits(false);
    this._updatePeriod();
    this._updateDayDisplay();
    this._renderLogs();
    if (data.expanded) {
      this._expanded = true;
      document.getElementById('worldClock').classList.add('expanded');
    }

    // 备注输入框 Enter 键添加
    const logInput = document.getElementById('wcLogInput');
    if (logInput) {
      logInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addLog();
        }
      });
    }

    // 根据页面控制可见性
    this._updateVisibility();
  },

  /* 控制世界时钟可见性（仅带团板页面显示） */
  _updateVisibility() {
    const el = document.getElementById('worldClock');
    if (el) {
      el.style.display = (AppState.currentPage === 'board') ? '' : 'none';
      if (AppState.currentPage === 'board') this._updatePosition();
    }
  },

  /* 计算世界时钟的top位置，使其紧贴流程单元标题栏底边 */
  _updatePosition() {
    const el = document.getElementById('worldClock');
    if (!el) return;
    let top = 135;
    const searchBar = document.getElementById('boardSearchBar');
    if (searchBar && searchBar.classList.contains('visible')) {
      top += searchBar.offsetHeight;
    }
    el.style.top = top + 'px';
  },

  /* 获取/确保 worldTime 数据 */
  _getData() {
    const board = AppState.currentModule && AppState.currentModule.board;
    if (!board) return { time: 480, day: 1, logs: [], expanded: false };
    if (!board.worldTime) {
      board.worldTime = { time: 480, day: 1, logs: [], expanded: false };
    }
    return board.worldTime;
  },

  /* 触发存档保存 */
  _scheduleSave() {
    if (typeof storageManager !== 'undefined' && storageManager.scheduleSave) {
      storageManager.scheduleSave();
    }
  },

  /* 切换展开/收起 */
  toggleExpand() {
    this._expanded = !this._expanded;
    const el = document.getElementById('worldClock');
    if (el) el.classList.toggle('expanded', this._expanded);
    this._getData().expanded = this._expanded;
    this._scheduleSave();
  },

  /* 时间转数字数组 [H0, H1, M0, M1] */
  _timeToDigits(minutes) {
    const h = Math.floor(((minutes % 1440) + 1440) % 1440 / 60);
    const m = ((minutes % 1440) + 1440) % 1440 % 60;
    const hStr = String(h).padStart(2, '0');
    const mStr = String(m).padStart(2, '0');
    return [hStr[0], hStr[1], mStr[0], mStr[1]];
  },

  /* 设置时间（分钟） */
  setTime(minutes) {
    const data = this._getData();
    const oldDay = data.day;
    // 处理跨天
    while (minutes >= 1440) {
      minutes -= 1440;
      data.day++;
    }
    while (minutes < 0) {
      minutes += 1440;
      if (data.day > 1) data.day--;
    }
    data.time = minutes;

    const newDigits = this._timeToDigits(minutes);
    // 判断方向：时间前进则新数字从下方进入，后退则从上方进入
    const forward = minutes >= this._prevTime();
    this._animateDigits(newDigits, forward);
    this._prevDigits = [...newDigits];
    this._updatePeriod();

    if (data.day !== oldDay) {
      this._updateDayDisplay(true);
    }

    const dayInput = document.getElementById('wcDayInput');
    if (dayInput) dayInput.value = data.day;

    this._scheduleSave();
  },

  /* 获取上一次时间值 */
  _prevTime() {
    const d = this._prevDigits;
    return (parseInt(d[0] + d[1]) * 60) + parseInt(d[2] + d[3]);
  },

  /* 调节时间（分钟增量，带节流） */
  adjust(delta) {
    const now = Date.now();
    if (now - this._lastAdjustTime < 150) return;
    this._lastAdjustTime = now;
    const data = this._getData();
    this.setTime(data.time + delta);
  },

  /* 设置天数 */
  setDay(dayNum) {
    const data = this._getData();
    const day = Math.max(1, parseInt(dayNum) || 1);
    data.day = day;
    this._updateDayDisplay(true);
    const dayInput = document.getElementById('wcDayInput');
    if (dayInput) dayInput.value = day;
    this._scheduleSave();
  },

  /* 调节天数（带节流） */
  adjustDay(delta) {
    const now = Date.now();
    if (now - this._lastAdjustTime < 150) return;
    this._lastAdjustTime = now;
    const data = this._getData();
    this.setDay(data.day + delta);
  },

  /* 快捷预设 */
  preset(name) {
    const presets = { dawn: 360, noon: 720, dusk: 1080, midnight: 0 };
    if (presets[name] !== undefined) {
      const data = this._getData();
      // 如果当前时间已过该预设点，则推进到下一天
      if (name === 'midnight' || data.time < presets[name]) {
        this.setTime(presets[name]);
      } else {
        // 推进到下一天
        data.day++;
        this.setTime(presets[name]);
      }
    }
  },

  /* 数字动画 */
  _animateDigits(newDigits, forward) {
    const slotIds = ['wcH0', 'wcH1', 'wcM0', 'wcM1'];
    slotIds.forEach((id, i) => {
      if (this._prevDigits[i] !== newDigits[i]) {
        this._animateDigit(id, this._prevDigits[i], newDigits[i], forward);
      }
    });
  },

  _animateDigit(slotId, oldDigit, newDigit, forward) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const isAnimating = this._animatingSlots.has(slotId);

    if (isAnimating) {
      // 槽位正在动画中：复用正在进入的元素，更新其值
      const digits = slot.querySelectorAll('.wc-digit');
      // 进入中的元素是最后一个（如果有两个），或唯一一个
      const enteringEl = digits.length >= 2 ? digits[1] : digits[0];
      if (enteringEl) {
        enteringEl.textContent = newDigit;
        // 重新触发动画：先移除再添加 class（强制重排）
        enteringEl.classList.remove('entering-from-bottom', 'entering-from-top');
        void enteringEl.offsetWidth; // 强制重排以重启动画
        enteringEl.classList.add(forward ? 'entering-from-bottom' : 'entering-from-top');
      }
      // 清除旧的定时器，设置新的
      if (slot._wcTimer) clearTimeout(slot._wcTimer);
      slot._wcTimer = setTimeout(() => {
        const allDigits = slot.querySelectorAll('.wc-digit');
        // 保留最后一个，移除其余
        for (let i = 0; i < allDigits.length - 1; i++) {
          allDigits[i].remove();
        }
        const finalEl = allDigits[allDigits.length - 1];
        if (finalEl) {
          finalEl.classList.remove('entering-from-bottom', 'entering-from-top',
                                    'exiting-to-top', 'exiting-to-bottom');
          finalEl.style.transform = 'translateY(0)';
          finalEl.style.opacity = '1';
          finalEl.style.filter = 'none';
        }
        this._animatingSlots.delete(slotId);
        slot._wcTimer = null;
      }, 360);
      return;
    }

    // 非动画状态：正常流程
    const oldEl = slot.querySelector('.wc-digit');
    if (!oldEl) return;

    this._animatingSlots.add(slotId);

    const newEl = document.createElement('div');
    newEl.className = 'wc-digit';
    newEl.textContent = newDigit;

    if (forward) {
      oldEl.classList.add('exiting-to-top');
      newEl.classList.add('entering-from-bottom');
    } else {
      oldEl.classList.add('exiting-to-bottom');
      newEl.classList.add('entering-from-top');
    }

    slot.appendChild(newEl);

    slot._wcTimer = setTimeout(() => {
      if (oldEl.parentNode) oldEl.remove();
      newEl.classList.remove('entering-from-bottom', 'entering-from-top');
      newEl.style.transform = 'translateY(0)';
      newEl.style.opacity = '1';
      newEl.style.filter = 'none';
      this._animatingSlots.delete(slotId);
      slot._wcTimer = null;
    }, 360);
  },

  /* 渲染数字（无动画） */
  _renderDigits(animate) {
    const data = this._getData();
    const digits = this._timeToDigits(data.time);
    const slotIds = ['wcH0', 'wcH1', 'wcM0', 'wcM1'];

    if (animate) {
      const forward = this._timeToMinutes(digits) >= this._prevTime();
      this._animateDigits(digits, forward);
    } else {
      slotIds.forEach((id, i) => {
        const slot = document.getElementById(id);
        if (slot) {
          slot.innerHTML = `<div class="wc-digit">${digits[i]}</div>`;
        }
      });
    }
    this._prevDigits = [...digits];
  },

  _timeToMinutes(digits) {
    return (parseInt(digits[0] + digits[1]) * 60) + parseInt(digits[2] + digits[3]);
  },

  /* 更新时段显示 */
  _updatePeriod() {
    const data = this._getData();
    const time = data.time;
    let period = this.PERIODS[0];
    for (const p of this.PERIODS) {
      if (time >= p.start && time < p.end) {
        period = p;
        break;
      }
    }

    // 更新图标
    const iconEl = document.getElementById('wcPeriodIcon');
    if (iconEl) iconEl.innerHTML = `<svg fill="currentColor"><use href="#${period.icon}"/></svg>`;

    // 更新标签
    const labelEl = document.getElementById('wcPeriodLabel');
    if (labelEl) labelEl.textContent = period.name;

    // 更新卡片时段类名（环境光效果）
    const clockEl = document.getElementById('worldClock');
    if (clockEl) {
      this.PERIODS.forEach(p => clockEl.classList.remove('period-' + p.key));
      clockEl.classList.add('period-' + period.key);
    }
  },

  /* 更新天数显示 */
  _updateDayDisplay(animate) {
    const data = this._getData();
    const dayEl = document.getElementById('wcDayNum');
    if (dayEl) {
      dayEl.textContent = data.day;
      if (animate) {
        dayEl.classList.remove('flip');
        void dayEl.offsetWidth; // 触发 reflow 以重新播放动画
        dayEl.classList.add('flip');
        setTimeout(() => dayEl.classList.remove('flip'), 500);
      }
    }
    const dayInput = document.getElementById('wcDayInput');
    if (dayInput) dayInput.value = data.day;
  },

  /* 添加时间备注 */
  addLog() {
    const input = document.getElementById('wcLogInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const data = this._getData();
    const h = Math.floor(data.time / 60);
    const m = data.time % 60;
    const timeStr = `第${data.day}天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    data.logs.unshift({
      time: timeStr,
      dayOrder: data.day,
      minutes: data.time,
      text: text,
      id: Date.now()
    });

    if (data.logs.length > 50) data.logs.pop();
    input.value = '';
    this._renderLogs();
    this._scheduleSave();
  },

  /* 删除时间备注 */
  deleteLog(logId) {
    const data = this._getData();
    data.logs = data.logs.filter(l => l.id !== logId);
    this._renderLogs();
    this._scheduleSave();
  },

  /* 渲染备注列表 */
  _renderLogs() {
    const listEl = document.getElementById('wcLogList');
    if (!listEl) return;
    const data = this._getData();

    if (!data.logs || data.logs.length === 0) {
      listEl.innerHTML = '<div class="wc-log-empty">暂无备注</div>';
      return;
    }

    let html = '';
    data.logs.forEach(log => {
      html += `<div class="wc-log-entry">`;
      html += `<span class="wc-log-dot"></span>`;
      html += `<span class="wc-log-time">${this._escHtml(log.time)}</span>`;
      html += `<span class="wc-log-text">${this._escHtml(log.text)}</span>`;
      html += `<button class="wc-log-del" onclick="WorldClock.deleteLog(${log.id})" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
      html += `</div>`;
    });
    listEl.innerHTML = html;
  },

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

/* ==========================================================================
 * Word 文档处理模块
 * 使用 mammoth.js 解析 .docx 文件，提取标题、角色数据块、表格
 * ========================================================================== */
const WordProcessor = {

  /* 处理导入的 Word 文件 */
  async processWord(file, moduleId) {
    const mod = AppState.findModule(moduleId);
    if (!mod) return;

    try {
      PDFProcessor.updateProgress(0, 1, '读取 Word 文件...');

      const arrayBuffer = await file.arrayBuffer();

      PDFProcessor.updateProgress(1, 3, '解析文档内容...');

      /* 使用 mammoth.js 将 docx 转为 HTML */
      let htmlResult;
      if (typeof mammoth !== 'undefined') {
        htmlResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
      } else {
        throw new Error('mammoth.js 库未加载');
      }

      const htmlContent = htmlResult.value;

      /* 提取纯文本 */
      PDFProcessor.updateProgress(2, 3, '分析文档结构...');
      let rawText = '';
      if (typeof mammoth !== 'undefined') {
        const textResult = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        rawText = textResult.value;
      }

      /* 标题识别：mammoth 输出的 HTML 已经包含 h1/h2/h3 标签 */
      const headings = this.extractHeadingsFromHtml(htmlContent);

      /* 角色数据块识别（复用 PDFProcessor 的纯文本方法） */
      const characters = PDFProcessor.processCharacterBlocks(rawText);

      /* 表格识别（复用 PDFProcessor 的纯文本方法） */
      const tables = PDFProcessor.processTables(rawText);

      /* 存入模组数据（与 PDF 处理后的结构一致） */
      mod.document = {
        pages: [],  // Word 文档没有分页概念
        rawText: rawText,
        htmlContent: htmlContent,
        processedHeadings: headings,
        processedCharacters: characters,
        processedTables: tables,
        bodyFontSize: null,  // Word 不需要字号检测
        bookmarks: [],
        sourceType: 'docx'  // 标记来源类型
      };

      /* 触发保存和渲染 */
      StorageManager.scheduleSave();
      DocEditor.loadDocument(mod);
      DocEditor.renderTocTree();

      /* 渐显动画 */
      const wrapper = document.querySelector('.editor-content-wrap');
      if (wrapper) {
        wrapper.classList.remove('visible');
        void wrapper.offsetWidth;
        wrapper.classList.add('visible');
      }

      /* 隐藏进度条，显示结果 */
      PDFProcessor.hideProgress();
      let msg = 'Word 文档导入完成';
      if (headings.length > 0) msg += `，识别到 ${headings.length} 个标题`;
      if (characters.length > 0) msg += `，${characters.length} 个角色`;
      if (tables.length > 0) msg += `，${tables.length} 个表格`;
      DocEditor.showToast(msg, 'success');

    } catch (e) {
      console.error('Word 文档处理失败', e);
      PDFProcessor.hideProgress();
      DocEditor.showToast('Word 文档处理失败：' + e.message, 'error');
    }
  },

  /* 从 HTML 中提取标题信息 */
  extractHeadingsFromHtml(html) {
    const headings = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const headingEls = doc.querySelectorAll('h1, h2, h3');
    for (const el of headingEls) {
      headings.push({
        level: parseInt(el.tagName.substring(1)),
        text: el.textContent.trim()
      });
    }
    return headings;
  }
};

/* ==========================================================================
 * 教学系统
 * ========================================================================== */
const Tutorial = {
  _events: {},
  on(event, callback) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(callback);
  },
  off(event, callback) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(cb => cb !== callback);
  },
  emit(event, data) {
    if (!this._events[event]) return;
    this._events[event].forEach(cb => cb(data));
  }
};

const TutorialManager = {
  _steps: [],
  _currentStepIndex: 0,
  _isActive: false,
  _isPaused: false,
  _isCompleted: false,
  STORAGE_KEY: 'cfpt-tutorial',
  VERSION: '0.81',

  init() {
    this._loadProgress();
    this._loadSteps();
    this._bindGlobalEvents();
  },

  _loadProgress() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      if (data.version === this.VERSION) {
        this._isCompleted = data.completed;
        if (!data.completed && !data.skipped) {
          this._currentStepIndex = data.currentStep || 0;
        }
      }
    } catch (e) {
      console.error('加载教学进度失败', e);
    }
  },

  _saveProgress() {
    const data = {
      version: this.VERSION,
      currentStep: this._currentStepIndex,
      completed: this._isCompleted,
      skipped: false
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  _loadSteps() {
    fetch('tutorial/tutorial.json')
      .then(res => res.json())
      .then(steps => {
        this._steps = steps;
        if (this._isActive && !this._isPaused) {
          this._renderStep(this._currentStepIndex);
        }
      })
      .catch(e => {
        console.error('加载教学步骤失败', e);
      });
  },

  _bindGlobalEvents() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isActive && !this._isPaused) {
        e.stopImmediatePropagation();
        this.showPauseMenu();
      }
    });

    let resizeRaf = null;
    const reposition = () => {
      if (this._isActive && !this._isPaused) {
        const step = this._steps[this._currentStepIndex];
        if (!step) return;
        this._positionHighlight(step.targetSelector, step.interactiveSelector, step.holeExpand);
        this._positionBubble(step.targetSelector, step.offset || 0, step.positionMode);
      }
    };
    window.addEventListener('resize', () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        reposition();
      });
    });
    window.addEventListener('scroll', () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        reposition();
      });
    }, { capture: true, passive: true });
  },

  _checkShowStartPrompt() {
    const workdirPrompt = document.getElementById('workdirPrompt');
    if (workdirPrompt && workdirPrompt.style.display !== 'none') return;
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (!saved) {
      document.getElementById('tutorialStartPrompt').classList.add('active');
      return;
    }
    try {
      const data = JSON.parse(saved);
      if (data.version !== this.VERSION) {
        document.getElementById('tutorialStartPrompt').classList.add('active');
      }
    } catch (e) {
      document.getElementById('tutorialStartPrompt').classList.add('active');
    }
  },

  startTutorial() {
    document.getElementById('tutorialStartPrompt').classList.remove('active');
    this._cleanupListeners();
    this._isActive = true;
    this._isPaused = false;
    this._isCompleted = false;
    this._currentStepIndex = 0;
    document.getElementById('tutorialMask').classList.add('active');
    if (this._steps.length > 0) {
      this._renderStep(this._currentStepIndex);
    }
  },

  _renderStep(index) {
    const step = this._steps[index];
    if (!step) return;

    if (step.checkConnectMode) {
      if (typeof BoardManager !== 'undefined' && !BoardManager._waitingForConnectSource && !BoardManager.isConnecting) {
        setTimeout(() => this.nextStep(), 100);
        return;
      }
    }

    // 先隐藏气泡和高亮（内容立即更新但透明，避免闪烁）
    const bubble = document.getElementById('tutorialBubble');
    const highlight = document.getElementById('tutorialHighlight');
    if (bubble) bubble.style.opacity = '0';
    if (highlight) highlight.style.opacity = '0';

    document.getElementById('tutorialStepTitle').textContent = '';
    document.getElementById('tutorialStepDesc').textContent = '';

    this._updateProgress(index);

    const renderHighlight = () => {
      document.getElementById('tutorialStepTitle').textContent = step.title;
      document.getElementById('tutorialStepDesc').textContent = step.desc;
      this._positionHighlight(step.targetSelector, step.interactiveSelector, step.holeExpand);
      this._positionBubble(step.targetSelector, step.offset || 0, step.positionMode);
      // 定位完成后淡入
      if (bubble) bubble.style.opacity = '1';
      if (highlight) highlight.style.opacity = '1';
    };

    if (step.waitEvent === 'createStoryClicked') {
      // 第1步：拦截创建新故事按钮，打开创建对话框
      this._bindCreateStoryListener();
      renderHighlight();
    } else if (step.waitEvent === 'docFileSelected') {
      // 第2步：创建对话框已打开，预填模组名 + 渲染高亮
      this._preFillCreateDialog();
      setTimeout(renderHighlight, 300);
    } else if (step.waitEvent === 'storyCreated') {
      // 第3步：确保对话框内容预填 + 高亮"创建模组"按钮
      this._preFillCreateDialog();
      setTimeout(renderHighlight, 50);
    } else if (step.waitEvent === 'boardEntered') {
      // 第7步：高亮编辑器中的"进入带团板"按钮
      renderHighlight();
    } else if (step.waitEvent === 'setupWizardClosed') {
      // 第8步：初始化向导弹出后查找按钮
      setTimeout(renderHighlight, 50);
    } else if (step.waitEvent === 'dbPanelOpened') {
      // 第10步：数据库面板打开后重新定位
      setTimeout(renderHighlight, 50);
    } else if (step.waitEvent === 'notesPlaced' || step.waitEvent === 'connectionsMade') {
      // 第11/12步：多目标挖洞（数据库面板+画布 / 连线按钮+画布）
      // 等待数据库面板 DOM 渲染完成（面板展开有 transition 动画）
      const delay = step.waitEvent === 'notesPlaced' ? 200 : 0;
      setTimeout(renderHighlight, delay);
    } else if (step.waitEvent === 'battleDeploymentCreated') {
      // 第13步：战斗部署卡创建后高亮"打开战斗"按钮在下一步，这里先高亮工具栏按钮
      renderHighlight();
    } else if (step.waitEvent === 'battleOpened' || step.waitEvent === 'addPanelOpened' || step.waitEvent === 'combatantsAdded' || step.waitEvent === 'initiativeChanged' || step.waitEvent === 'actionSelected' || step.waitEvent === 'actionExecuted' || step.waitEvent === 'roundEnded' || step.waitEvent === 'endTurnClicked') {
      // 第14-17步：战斗界面元素需要延迟渲染（overlay动画/面板打开/先攻列表刷新）
      setTimeout(renderHighlight, 450);
    } else if (step.waitEvent === 'roundEnded') {
      // 第18步：战斗界面全交互，不再限制交互范围
      renderHighlight();
    } else if (step.waitEvent === 'noteAddedToDatabase') {
      // 第4/5/6步：编辑器归类步骤，等待编辑器DOM稳定后挖洞 + 发光高亮
      setTimeout(renderHighlight, 500);
      setTimeout(() => {
        if (step.highlightTexts) this._highlightEditorText(step.highlightTexts);
      }, 650);
    } else {
      renderHighlight();
    }

    // 手动推进按钮（无 waitEvent 的步骤使用）
    const advBtn = document.getElementById('tutorialBubbleAdvance');
    if (advBtn) {
      advBtn.style.display = step.advanceButton ? 'block' : 'none';
    }

    this._setupEventListening(step);
  },

  _preFillCreateDialog(step) {
    setTimeout(() => {
      const nameInput = document.getElementById('createName');
      if (nameInput && !nameInput.value) {
        nameInput.value = '酒馆夜话 - 教学';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const confirmBtn = document.getElementById('createConfirmBtn');
      if (confirmBtn) {
        const checkName = () => {
          confirmBtn.disabled = !nameInput.value.trim();
        };
        checkName();
        nameInput.removeEventListener('input', checkName);
        nameInput.addEventListener('input', checkName);
      }
    }, 300);
  },

  _positionHighlight(targetSelector, interactiveSelector, holeExpand = 0) {
    const highlight = document.getElementById('tutorialHighlight');
    const mask = document.getElementById('tutorialMask');
    if (!highlight) return;

    const target = document.querySelector(targetSelector);
    if (!target) {
      highlight.style.display = 'none';
      if (mask) mask.style.clipPath = 'none';
      return;
    }

    // rAF 确保布局计算完成（修复编辑器首次渲染时 rect 不准确的问题）
    requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    highlight.style.borderRadius = window.getComputedStyle(target).borderRadius;

    if (mask) {
      let selector = interactiveSelector || targetSelector;
      // 编辑器文字归类步骤：挖洞覆盖整个编辑区域
      if (targetSelector === '#editorContent' && !interactiveSelector) {
        selector = '#editorContentWrap';
      }
      const selectors = selector.split(',').map(s => s.trim()).filter(s => s);
      
      const holes = [];
      selectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          const r = el.getBoundingClientRect();
          holes.push({ x1: r.left - holeExpand, y1: r.top - holeExpand, x2: r.left + r.width + holeExpand, y2: r.top + r.height + holeExpand });
        });
      });

      if (holes.length === 0) {
        mask.style.clipPath = 'none';
        return;
      }

      // 合并重叠的洞，避免 evenodd 规则下重叠区域被误填充
      let merged = holes;
      let changed = true;
      while (changed) {
        changed = false;
        const result = [];
        const used = new Set();
        for (let i = 0; i < merged.length; i++) {
          if (used.has(i)) continue;
          let m = { ...merged[i] };
          for (let j = i + 1; j < merged.length; j++) {
            if (used.has(j)) continue;
            const h = merged[j];
            if (m.x1 < h.x2 && m.x2 > h.x1 && m.y1 < h.y2 && m.y2 > h.y1) {
              m.x1 = Math.min(m.x1, h.x1);
              m.y1 = Math.min(m.y1, h.y1);
              m.x2 = Math.max(m.x2, h.x2);
              m.y2 = Math.max(m.y2, h.y2);
              used.add(j);
              changed = true;
            }
          }
          result.push(m);
        }
        merged = result;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      
      let clipPath = `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px`;
      merged.forEach((hole, i) => {
        if (i > 0) clipPath += ', 0px 0px';
        clipPath += `, ${hole.x1}px ${hole.y1}px, ${hole.x1}px ${hole.y2}px, ${hole.x2}px ${hole.y2}px, ${hole.x2}px ${hole.y1}px, ${hole.x1}px ${hole.y1}px`;
      });
      clipPath += ')';
      
      mask.style.clipPath = clipPath;
    }
    });
  },

  _positionBubble(selector, extraOffset = 0, positionMode = null) {
    const bubble = document.getElementById('tutorialBubble');
    if (!bubble) return;

    const target = document.querySelector(selector);
    if (!target) {
      bubble.style.display = 'none';
      return;
    }

    const rect = target.getBoundingClientRect();
    const bubbleWidth = 320;
    const bubbleHeight = 100;
    const baseOffset = 12;
    const offset = baseOffset + extraOffset;

    let left, top, direction;

    if (positionMode === 'topCenter') {
      left = Math.max(20, window.innerWidth / 2 - bubbleWidth / 2);
      top = 20;
      direction = 'bottom';
    } else {
      left = rect.left + rect.width / 2 - bubbleWidth / 2;
      top = rect.top - bubbleHeight - offset;
      direction = 'top';

      if (top < 20) {
        top = rect.bottom + offset;
        direction = 'bottom';
      }
      if (left < 20) {
        left = 20;
      }
      if (left + bubbleWidth > window.innerWidth - 20) {
        left = window.innerWidth - bubbleWidth - 20;
      }
    }

    // 动态计算箭头位置：指向目标元素中心
    const targetCenterX = rect.left + rect.width / 2;
    const arrowLeft = targetCenterX - left;
    // 限制箭头在气泡可见范围内（留8px边距）
    bubble.style.setProperty('--arrow-left', Math.max(8, Math.min(arrowLeft, bubbleWidth - 20)) + 'px');

    bubble.style.display = 'block';
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
    bubble.className = 'tutorial-bubble ' + direction;
  },

  _updateProgress(index) {
    const total = this._steps.length;
    const fill = document.getElementById('tutorialProgressFill');
    if (fill) {
      fill.style.width = `${((index + 1) / total) * 100}%`;
    }
  },

  _setupEventListening(step) {
    if (!step.waitEvent) return;

    let eventCount = 0;

    const handler = (data) => {
      if (step.waitFilter && step.waitFilter.count) {
        eventCount++;
        if (eventCount >= step.waitFilter.count) {
          this._markStepComplete();
        }
      } else if (this._checkFilter(data, step.waitFilter)) {
        this._markStepComplete();
      }
    };

    Tutorial.on(step.waitEvent, handler);
    this._currentHandler = handler;
  },

  _checkFilter(data, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    for (const key in filter) {
      if (key === 'count') continue;
      if (data[key] !== filter[key]) return false;
    }
    return true;
  },

  _markStepComplete() {
    // 清除编辑器发光高亮
    this._removeEditorHighlight();
    // 先淡出气泡和高亮
    const bubble = document.getElementById('tutorialBubble');
    const highlight = document.getElementById('tutorialHighlight');
    if (bubble) bubble.style.opacity = '0';
    if (highlight) highlight.style.opacity = '0';

    if (this._currentHandler) {
      Tutorial.off(this._steps[this._currentStepIndex].waitEvent, this._currentHandler);
      this._currentHandler = null;
    }
    this._unbindCreateStoryListener();

    setTimeout(() => {
      this.nextStep();
    }, 0);
  },

  nextStep() {
    if (this._currentStepIndex >= this._steps.length - 1) {
      this.completeTutorial();
      return;
    }
    this._currentStepIndex++;
    this._saveProgress();
    this._renderStep(this._currentStepIndex);
  },

  showPauseMenu() {
    this._isPaused = true;
    document.getElementById('tutorialPauseMenu').classList.add('active');
  },

  hidePauseMenu() {
    this._isPaused = false;
    document.getElementById('tutorialPauseMenu').classList.remove('active');
  },

  skipTutorial() {
    this._removeEditorHighlight();
    this._cleanupListeners();
    this._isActive = false;
    this._isPaused = false;
    document.getElementById('tutorialMask').classList.remove('active');
    document.getElementById('tutorialHighlight').style.display = 'none';
    document.getElementById('tutorialBubble').style.display = 'none';
    document.getElementById('tutorialPauseMenu').classList.remove('active');
    document.getElementById('tutorialStartPrompt').classList.remove('active');
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
      version: this.VERSION,
      currentStep: 0,
      completed: false,
      skipped: true
    }));
  },

  restartTutorial() {
    this.hidePauseMenu();
    this._removeEditorHighlight();
    this._cleanupListeners();
    this._isActive = true;
    this._isPaused = false;
    this._isCompleted = false;
    this._currentStepIndex = 0;
    this._saveProgress();
    document.getElementById('tutorialMask').classList.add('active');
    this._renderStep(0);
  },

  completeTutorial() {
    this._removeEditorHighlight();
    this._isActive = false;
    this._isCompleted = true;
    this._saveProgress();

    document.getElementById('tutorialMask').classList.remove('active');
    document.getElementById('tutorialHighlight').style.display = 'none';
    document.getElementById('tutorialBubble').style.display = 'none';

    // 自动删除教学故事
    const modules = JSON.parse(localStorage.getItem('cfpt-modules') || '[]');
    const tutorialModule = modules.find(m => m.name === '酒馆夜话 - 教学' || m.isTutorial);
    if (tutorialModule) {
      const filtered = modules.filter(m => m.id !== tutorialModule.id);
      localStorage.setItem('cfpt-modules', JSON.stringify(filtered));
    }

    // 显示完成弹窗（用户点击按钮后才跳转首页）
    document.getElementById('tutorialCompleteModal').classList.add('active');
    this._spawnCompletionParticles();
  },

  _spawnCompletionParticles() {
    const modal = document.getElementById('tutorialCompleteModal');
    if (!modal) return;

    const rect = modal.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        const particle = document.createElement('div');
        particle.className = 'tutorial-particle';
        particle.style.left = centerX + 'px';
        particle.style.top = centerY + 'px';

        const angle = Math.random() * Math.PI * 2;
        const distance = 100 + Math.random() * 150;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');
        particle.style.animationDelay = Math.random() * 0.5 + 's';

        document.body.appendChild(particle);

        setTimeout(() => {
          particle.remove();
        }, 2500);
      }, i * 50);
    }
  },

  deleteTutorialStory() {
    document.getElementById('tutorialCompleteModal').classList.remove('active');
    const modules = JSON.parse(localStorage.getItem('cfpt-modules') || '[]');
    const tutorialModule = modules.find(m => m.name === '酒馆夜话 - 教学' || m.isTutorial);
    if (tutorialModule) {
      const filtered = modules.filter(m => m.id !== tutorialModule.id);
      localStorage.setItem('cfpt-modules', JSON.stringify(filtered));
    }
  },

  keepTutorialStory() {
    document.getElementById('tutorialCompleteModal').classList.remove('active');
    App.goHome();
  },

  _createStoryHandler: null,

  _bindCreateStoryListener() {
    const btn = document.querySelector('.fm-item[data-fm-texts*=\'创建新故事\']');
    if (!btn) return;

    this._createStoryHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      App.showCreateDialog();
      Tutorial.emit('createStoryClicked', {});
    };

    btn.addEventListener('click', this._createStoryHandler);
  },

  _unbindCreateStoryListener() {
    const btn = document.querySelector('.fm-item[data-fm-texts*=\'创建新故事\']');
    if (btn && this._createStoryHandler) {
      btn.removeEventListener('click', this._createStoryHandler);
      this._createStoryHandler = null;
    }
  },

  _cleanupListeners() {
    // 无条件清理所有可能的旧监听器
    const allEvents = ['createStoryClicked', 'docFileSelected', 'storyCreated', 'boardEntered',
      'setupWizardClosed', 'dbPanelOpened', 'noteAddedToDatabase', 'notesPlaced',
      'connectionsMade', 'flowUnitCreated', 'battleDeploymentCreated', 'battleOpened',
      'addPanelOpened', 'combatantsAdded', 'initiativeChanged', 'endTurnClicked',
      'actionSelected', 'actionExecuted'];
    allEvents.forEach(ev => {
      if (this._currentHandler) Tutorial.off(ev, this._currentHandler);
    });
    // 如果 _currentHandler 为空，尝试全量清除
    if (!this._currentHandler) {
      allEvents.forEach(ev => Tutorial.off(ev));
    }
    this._currentHandler = null;
    this._unbindCreateStoryListener();
    
    // 重置文件输入，避免二次选择同文件时 change 不触发
    const docInput = document.getElementById('pdfFileInput');
    if (docInput) docInput.value = '';
    if (typeof AppState !== 'undefined') AppState.pendingDocFile = null;
  },

  _highlightEditorText(keywords) {
    if (!keywords || !keywords.length) return;
    const editor = document.getElementById('editorContent');
    if (!editor) return;
    this._removeEditorHighlight();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      let matched = false;
      for (const kw of keywords) {
        if (node.textContent.indexOf(kw) !== -1) { matched = true; break; }
      }
      if (!matched) continue;
      // 上溯到最近的块级父元素
      let block = node.parentElement;
      while (block && block !== editor && block.tagName !== 'P' && block.tagName !== 'DIV' && block.tagName !== 'H1' && block.tagName !== 'H2') {
        block = block.parentElement;
      }
      if (block && block !== editor) {
        block.classList.add('tutorial-glow-text');
      }
    }
  },

  _removeEditorHighlight() {
    const editor = document.getElementById('editorContent');
    if (!editor) return;
    const glows = editor.querySelectorAll('.tutorial-glow-text');
    glows.forEach(el => el.classList.remove('tutorial-glow-text'));
  },

  _markLatestModuleAsTutorial() {
    const modules = JSON.parse(localStorage.getItem('cfpt-modules') || '[]');
    if (modules.length > 0) {
      modules[modules.length - 1].isTutorial = true;
      localStorage.setItem('cfpt-modules', JSON.stringify(modules));
    }
  }
};

/* ==========================================================================
 * 应用启动
 * ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // 监听父窗口的强制保存指令（用原生 addEventListener 避免依赖 SharedBridge）
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'FORCE_SAVE') {
      /* 先刷新编辑器未保存内容到数据层，再写盘 */
      if (typeof DocEditor !== 'undefined' && DocEditor.saveDocument) DocEditor.saveDocument();
      if (typeof BoardManager !== 'undefined' && BoardManager.saveBoard) BoardManager.saveBoard();
      StorageManager.saveNow();
    }
  });
  App.init();
  TutorialManager.init();
});
