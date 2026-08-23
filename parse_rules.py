#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import json
import html
from pathlib import Path

BASE_DIR = Path(r"c:\Users\沉云\Desktop\备团助手\规则书\DND5e_chm-main")
OUTPUT_FILE = Path(r"c:\Users\沉云\Desktop\备团助手\electron-app\dnd5r_rules.json")

SPELL_SCHOOLS = {
    "咒法": "conjuration",
    "附魔": "enchantment",
    "塑能": "evocation",
    "幻术": "illusion",
    "死灵": "necromancy",
    "预言": "divination",
    "防护": "abjuration",
    "变化": "transmutation",
}

SCHOOL_CN_TO_EN = {v: k for k, v in SPELL_SCHOOLS.items()}

def decode_gbk(content):
    try:
        return content.decode('gbk', errors='replace')
    except:
        return content.decode('gb2312', errors='replace')

def clean_html(html_str):
    html_str = re.sub(r'<script[^>]*>.*?</script>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<style[^>]*>.*?</style>', '', html_str, flags=re.DOTALL)
    html_str = re.sub(r'<[^>]+>', '', html_str)
    html_str = html.unescape(html_str)
    html_str = re.sub(r'\s+', ' ', html_str).strip()
    return html_str

def parse_spells():
    spells = []
    spell_dir = BASE_DIR / "玩家手册2024" / "法术详述"
    if not spell_dir.exists():
        print(f"[WARN] 法术目录不存在: {spell_dir}")
        return spells
    
    for level_file in sorted(spell_dir.glob("*.htm")):
        level_name = level_file.stem.replace("环", "")
        if level_name == "0":
            level_int = 0
        elif level_name == "1":
            level_int = 1
        else:
            try:
                level_int = int(level_name)
            except:
                continue
        
        with open(level_file, 'rb') as f:
            content = decode_gbk(f.read())
        
        h4_pattern = r'<H4[^>]*id="([^"]+)">([^<]+)</H4>'
        matches = re.findall(h4_pattern, content)
        
        for anchor, raw_title in matches:
            title_parts = raw_title.split("——")
            if len(title_parts) == 2:
                cn_name = title_parts[0].strip()
                en_name = title_parts[1].strip()
            else:
                cn_name = raw_title.strip()
                en_name = anchor.replace('_', ' ')
            
            spell_start = content.find(f'<H4[^>]*id="{anchor}">')
            spell_end = content.find('<H4', spell_start + 10)
            if spell_end == -1:
                spell_end = content.find('</body>', spell_start)
            
            spell_html = content[spell_start:spell_end]
            
            cast_time = re.search(r'施法时间：([^<]+)', spell_html)
            cast_time = cast_time.group(1).strip() if cast_time else ""
            
            range_match = re.search(r'施法距离：([^<]+)', spell_html)
            spell_range = range_match.group(1).strip() if range_match else ""
            
            components = re.search(r'法术成分：([^<]+)', spell_html)
            components = components.group(1).strip() if components else ""
            
            duration = re.search(r'持续时间：([^<]+)', spell_html)
            duration = duration.group(1).strip() if duration else ""
            
            schools_in_title = re.search(r'《([^》]+)》', raw_title)
            school = ""
            if schools_in_title:
                school_text = schools_in_title.group(1)
                for cn, en in SPELL_SCHOOLS.items():
                    if cn in school_text:
                        school = en
                        break
            
            description_start = spell_html.find('</H4>')
            if description_start != -1:
                desc_html = spell_html[description_start:]
                description = clean_html(desc_html)[:2000]
            else:
                description = ""
            
            spells.append({
                "id": f"spell_{anchor}",
                "type": "spell",
                "level": level_int,
                "school": school,
                "name": cn_name,
                "englishName": en_name,
                "castTime": cast_time,
                "range": spell_range,
                "components": components,
                "duration": duration,
                "description": description,
                "source": "玩家手册2024",
                "sourceFile": f"法术详述/{level_file.name}",
            })
    
    print(f"[OK] 解析法术: {len(spells)} 个")
    return spells

def parse_monsters():
    monsters = []
    monster_dir = BASE_DIR / "怪物图鉴2025"
    if not monster_dir.exists():
        print(f"[WARN] 怪物目录不存在: {monster_dir}")
        return monsters
    
    for category_dir in monster_dir.glob("*"):
        if not category_dir.is_dir() or category_dir.name.startswith('.'):
            continue
        
        for monster_file in sorted(category_dir.rglob("*.htm")):
            try:
                with open(monster_file, 'rb') as f:
                    content = decode_gbk(f.read())
                
                h1_match = re.search(r'<H1>([^<]+)</H1>', content)
                h2_match = re.search(r'<H2>([^<]+)</H2>', content)
                h5_match = re.search(r'<H5[^>]*id="([^"]+)">([^<]+)</H5>', content)
                
                if h5_match:
                    anchor = h5_match.group(1)
                    title = h5_match.group(2)
                elif h2_match:
                    anchor = category_dir.name + "_" + monster_file.stem
                    title = h2_match.group(1)
                elif h1_match:
                    anchor = category_dir.name + "_" + monster_file.stem
                    title = h1_match.group(1)
                else:
                    continue
                
                title_parts = title.split(" ")
                if len(title_parts) >= 2:
                    cn_name = title_parts[0]
                    en_name = " ".join(title_parts[1:])
                else:
                    cn_name = title
                    en_name = ""
                
                stat_block = {}
                
                ac_match = re.search(r'<strong>AC\s*</strong>\s*(\d+)', content)
                if ac_match:
                    stat_block["ac"] = int(ac_match.group(1))
                
                hp_match = re.search(r'<strong>HP\s*</strong>\s*(\d+)', content)
                if hp_match:
                    stat_block["hp"] = int(hp_match.group(1))
                
                speed_match = re.search(r'<strong>速度\s*</strong>\s*([^<]+)', content)
                if speed_match:
                    stat_block["speed"] = speed_match.group(1).strip()
                
                cr_match = re.search(r'<strong>CR\s*</strong>\s*([^<]+)', content)
                if cr_match:
                    stat_block["cr"] = cr_match.group(1).strip()
                
                abil_pattern = r'<strong>([^<]+)</strong>\s*(\d+)\s*\+(\d+)'
                abilities = re.findall(abil_pattern, content)
                abil_map = {}
                for abil_name, score, mod in abilities:
                    abil_name_clean = abil_name.strip()
                    if abil_name_clean in ["力量", "敏捷", "体质", "智力", "感知", "魅力"]:
                        abil_map[abil_name_clean] = {"score": int(score), "mod": int(mod)}
                
                if abil_map:
                    stat_block["abilities"] = abil_map
                
                traits_section = content.find('<h6>特性')
                actions_section = content.find('<h6>动作')
                legendary_section = content.find('<h6>传奇')
                
                traits_text = ""
                if traits_section != -1:
                    end = actions_section if actions_section > traits_section else legendary_section
                    if end == -1:
                        end = content.find('</div>', traits_section)
                    if end != -1:
                        traits_html = content[traits_section:end]
                        traits_text = clean_html(traits_html)
                
                actions_text = ""
                if actions_section != -1:
                    end = legendary_section if legendary_section > actions_section else content.find('</div>', actions_section)
                    if end != -1:
                        actions_html = content[actions_section:end]
                        actions_text = clean_html(actions_html)
                
                legendary_text = ""
                if legendary_section != -1:
                    end = content.find('</div>', legendary_section)
                    if end != -1:
                        legendary_html = content[legendary_section:end]
                        legendary_text = clean_html(legendary_html)
                
                description_start = content.find('</H1>') if h1_match else content.find('</H2>') if h2_match else 0
                if description_start != -1:
                    desc_end = content.find('<div class="stat-block">')
                    if desc_end == -1:
                        desc_end = content.find('<h6>')
                    if desc_end != -1:
                        desc_html = content[description_start:desc_end]
                        description = clean_html(desc_html)[:1000]
                    else:
                        description = ""
                else:
                    description = ""
                
                monsters.append({
                    "id": f"monster_{anchor}",
                    "type": "monster",
                    "name": cn_name,
                    "englishName": en_name,
                    "category": category_dir.name,
                    "statBlock": stat_block,
                    "traits": traits_text,
                    "actions": actions_text,
                    "legendaryActions": legendary_text,
                    "description": description,
                    "source": "怪物图鉴2025",
                    "sourceFile": str(monster_file.relative_to(BASE_DIR)),
                })
            except Exception as e:
                print(f"[ERR] 解析怪物 {monster_file}: {e}")
    
    print(f"[OK] 解析怪物: {len(monsters)} 个")
    return monsters

def parse_weapons():
    weapons = []
    weapons_file = BASE_DIR / "玩家手册2024" / "装备" / "武器.htm"
    if not weapons_file.exists():
        print(f"[WARN] 武器文件不存在: {weapons_file}")
        return weapons
    
    with open(weapons_file, 'rb') as f:
        content = decode_gbk(f.read())
    
    table_pattern = r'<TABLE[^>]*>(.*?)</TABLE>'
    tables = re.findall(table_pattern, content, flags=re.DOTALL)
    
    for table in tables:
        tr_pattern = r'<TR[^>]*>(.*?)</TR>'
        rows = re.findall(tr_pattern, table, flags=re.DOTALL)
        
        header_text = clean_html(rows[0]) if rows else ""
        category = ""
        if "简单" in header_text:
            category = "简单武器"
        elif "格斗" in header_text or "martial" in header_text.lower():
            category = "格斗武器"
        
        for row in rows[1:]:
            td_pattern = r'<TD[^>]*>(.*?)</TD>'
            cells = re.findall(td_pattern, row, flags=re.DOTALL)
            
            if len(cells) >= 6:
                name_cell = clean_html(cells[0])
                name_parts = name_cell.split(" ")
                if len(name_parts) >= 2:
                    cn_name = name_parts[0]
                    en_name = " ".join(name_parts[1:])
                else:
                    cn_name = name_cell
                    en_name = ""
                
                damage = clean_html(cells[1])
                properties = clean_html(cells[2])
                mastery = clean_html(cells[3])
                weight = clean_html(cells[4])
                price = clean_html(cells[5])
                
                weapons.append({
                    "id": f"weapon_{en_name.replace(' ', '_')}",
                    "type": "weapon",
                    "category": category,
                    "name": cn_name,
                    "englishName": en_name,
                    "damage": damage,
                    "properties": properties,
                    "mastery": mastery,
                    "weight": weight,
                    "price": price,
                    "source": "玩家手册2024",
                    "sourceFile": "装备/武器.htm",
                })
    
    print(f"[OK] 解析武器: {len(weapons)} 个")
    return weapons

def parse_armor():
    armor = []
    armor_file = BASE_DIR / "玩家手册2024" / "装备" / "护甲.htm"
    if not armor_file.exists():
        print(f"[WARN] 护甲文件不存在: {armor_file}")
        return armor
    
    with open(armor_file, 'rb') as f:
        content = decode_gbk(f.read())
    
    table_pattern = r'<TABLE[^>]*>(.*?)</TABLE>'
    tables = re.findall(table_pattern, content, flags=re.DOTALL)
    
    for table in tables:
        tr_pattern = r'<TR[^>]*>(.*?)</TR>'
        rows = re.findall(tr_pattern, table, flags=re.DOTALL)
        
        for row in rows[1:]:
            td_pattern = r'<TD[^>]*>(.*?)</TD>'
            cells = re.findall(td_pattern, row, flags=re.DOTALL)
            
            if len(cells) >= 6:
                name_cell = clean_html(cells[0])
                name_parts = name_cell.split(" ")
                if len(name_parts) >= 2:
                    cn_name = name_parts[0]
                    en_name = " ".join(name_parts[1:])
                else:
                    cn_name = name_cell
                    en_name = ""
                
                ac = clean_html(cells[1])
                strength_req = clean_html(cells[2])
                stealth = clean_html(cells[3])
                weight = clean_html(cells[4])
                price = clean_html(cells[5])
                
                category = ""
                if "轻甲" in name_cell:
                    category = "轻甲"
                elif "中甲" in name_cell:
                    category = "中甲"
                elif "重甲" in name_cell:
                    category = "重甲"
                
                armor.append({
                    "id": f"armor_{en_name.replace(' ', '_')}",
                    "type": "armor",
                    "category": category,
                    "name": cn_name,
                    "englishName": en_name,
                    "ac": ac,
                    "strengthReq": strength_req,
                    "stealth": stealth,
                    "weight": weight,
                    "price": price,
                    "source": "玩家手册2024",
                    "sourceFile": "装备/护甲.htm",
                })
    
    print(f"[OK] 解析护甲: {len(armor)} 个")
    return armor

def parse_equipment():
    equipment = []
    equip_dir = BASE_DIR / "玩家手册2024" / "装备"
    
    for equip_file in sorted(equip_dir.glob("*.htm")):
        if equip_file.name in ["武器.htm", "护甲.htm"]:
            continue
        
        with open(equip_file, 'rb') as f:
            content = decode_gbk(f.read())
        
        table_pattern = r'<TABLE[^>]*>(.*?)</TABLE>'
        tables = re.findall(table_pattern, content, flags=re.DOTALL)
        
        for table in tables:
            tr_pattern = r'<TR[^>]*>(.*?)</TR>'
            rows = re.findall(tr_pattern, table, flags=re.DOTALL)
            
            for row in rows[1:]:
                td_pattern = r'<TD[^>]*>(.*?)</TD>'
                cells = re.findall(td_pattern, row, flags=re.DOTALL)
                
                if len(cells) >= 2:
                    name_cell = clean_html(cells[0])
                    name_parts = name_cell.split(" ")
                    if len(name_parts) >= 2:
                        cn_name = name_parts[0]
                        en_name = " ".join(name_parts[1:])
                    else:
                        cn_name = name_cell
                        en_name = ""
                    
                    price = clean_html(cells[-1]) if cells else ""
                    
                    equipment.append({
                        "id": f"equip_{en_name.replace(' ', '_')}",
                        "type": "equipment",
                        "category": equip_file.stem,
                        "name": cn_name,
                        "englishName": en_name,
                        "price": price,
                        "source": "玩家手册2024",
                        "sourceFile": f"装备/{equip_file.name}",
                    })
    
    print(f"[OK] 解析装备: {len(equipment)} 个")
    return equipment

def parse_feats():
    feats = []
    feat_dir = BASE_DIR / "玩家手册2024" / "专长"
    
    for feat_file in sorted(feat_dir.glob("*.htm")):
        with open(feat_file, 'rb') as f:
            content = decode_gbk(f.read())
        
        h2_pattern = r'<h2[^>]*>([^<]+)</h2>'
        h2_match = re.search(h2_pattern, content)
        category = h2_match.group(1) if h2_match else feat_file.stem
        
        p_pattern = r'<p[^>]*>(.*?)</p>'
        paragraphs = re.findall(p_pattern, content, flags=re.DOTALL)
        
        current_feat = None
        for p in paragraphs:
            colored_match = re.search(r'<FONT color=#800000><b>([^<]+)</b></FONT>', p)
            if colored_match:
                if current_feat:
                    feats.append(current_feat)
                
                name = clean_html(colored_match.group(1))
                name_parts = name.split(" ")
                if len(name_parts) >= 2:
                    cn_name = name_parts[0]
                    en_name = " ".join(name_parts[1:])
                else:
                    cn_name = name
                    en_name = ""
                
                italic_match = re.search(r'<i>([^<]+)</i>', p)
                prereq = clean_html(italic_match.group(1)) if italic_match else ""
                
                current_feat = {
                    "id": f"feat_{en_name.replace(' ', '_')}",
                    "type": "feat",
                    "category": category,
                    "name": cn_name,
                    "englishName": en_name,
                    "prerequisite": prereq,
                    "description": "",
                    "source": "玩家手册2024",
                    "sourceFile": f"专长/{feat_file.name}",
                }
            elif current_feat:
                desc_text = clean_html(p)
                if desc_text and len(desc_text) > 10:
                    current_feat["description"] += desc_text + " "
        
        if current_feat:
            feats.append(current_feat)
    
    print(f"[OK] 解析专长: {len(feats)} 个")
    return feats

def parse_magic_items():
    magic_items = []
    magic_dir = BASE_DIR / "城主指南2024" / "7.宝藏" / "魔法物品详述"
    
    if not magic_dir.exists():
        print(f"[WARN] 魔法物品目录不存在: {magic_dir}")
        return magic_items
    
    for sub_dir in sorted(magic_dir.glob("*")):
        if not sub_dir.is_dir():
            continue
        
        for item_file in sorted(sub_dir.glob("*.htm")):
            try:
                with open(item_file, 'rb') as f:
                    content = decode_gbk(f.read())
                
                h1_match = re.search(r'<H1[^>]*>([^<]+)</H1>', content)
                h2_match = re.search(r'<H2[^>]*>([^<]+)</H2>', content)
                
                if h1_match:
                    title = h1_match.group(1)
                elif h2_match:
                    title = h2_match.group(1)
                else:
                    title = item_file.stem
                
                title_parts = title.split("——")
                if len(title_parts) == 2:
                    cn_name = title_parts[0].strip()
                    en_name = title_parts[1].strip()
                else:
                    cn_name = title.strip()
                    en_name = ""
                
                description_start = content.find('</H1>') if h1_match else content.find('</H2>') if h2_match else 0
                if description_start != -1:
                    desc_end = content.find('<TABLE')
                    if desc_end == -1:
                        desc_end = content.find('</body>')
                    if desc_end != -1:
                        desc_html = content[description_start:desc_end]
                        description = clean_html(desc_html)[:2000]
                    else:
                        description = ""
                else:
                    description = ""
                
                rarity_match = re.search(r'稀有度[^：:]*[：:]\s*([^<]+)', content)
                rarity = rarity_match.group(1).strip() if rarity_match else ""
                
                magic_items.append({
                    "id": f"magic_{en_name.replace(' ', '_')}",
                    "type": "magic_item",
                    "category": sub_dir.name,
                    "name": cn_name,
                    "englishName": en_name,
                    "rarity": rarity,
                    "description": description,
                    "source": "城主指南2024",
                    "sourceFile": str(item_file.relative_to(BASE_DIR)),
                })
            except Exception as e:
                print(f"[ERR] 解析魔法物品 {item_file}: {e}")
    
    print(f"[OK] 解析魔法物品: {len(magic_items)} 个")
    return magic_items

def parse_rules():
    rules = []
    books = [
        ("玩家手册2024", BASE_DIR / "玩家手册2024"),
        ("城主指南2024", BASE_DIR / "城主指南2024"),
        ("怪物图鉴2025", BASE_DIR / "怪物图鉴2025"),
    ]
    
    for book_name, book_dir in books:
        for html_file in sorted(book_dir.rglob("*.htm")):
            try:
                with open(html_file, 'rb') as f:
                    content = decode_gbk(f.read())
                
                title_match = re.search(r'<title[^>]*>([^<]+)</title>', content)
                title = title_match.group(1) if title_match else html_file.stem
                
                clean_title = clean_html(title)
                
                body_start = content.find('<body>')
                body_end = content.find('</body>')
                
                if body_start != -1 and body_end != -1:
                    body_content = content[body_start:body_end]
                    full_text = clean_html(body_content)[:5000]
                else:
                    full_text = clean_html(content)[:5000]
                
                rel_path = str(html_file.relative_to(BASE_DIR))
                
                rules.append({
                    "id": f"rule_{rel_path.replace('/', '_').replace('.htm', '')}",
                    "type": "rule",
                    "name": clean_title,
                    "description": full_text,
                    "source": book_name,
                    "sourceFile": rel_path,
                })
            except Exception as e:
                print(f"[ERR] 解析规则文件 {html_file}: {e}")
    
    print(f"[OK] 解析规则说明: {len(rules)} 个")
    return rules

def parse_races():
    races = []
    race_dir = BASE_DIR / "玩家手册2024" / "角色起源" / "种族"
    
    if not race_dir.exists():
        print(f"[WARN] 种族目录不存在: {race_dir}")
        return races
    
    for race_file in sorted(race_dir.glob("*.htm")):
        with open(race_file, 'rb') as f:
            content = decode_gbk(f.read())
        
        h1_match = re.search(r'<H1[^>]*>([^<]+)</H1>', content)
        if h1_match:
            title = h1_match.group(1)
            title_parts = title.split(" ")
            if len(title_parts) >= 2:
                cn_name = title_parts[0]
                en_name = " ".join(title_parts[1:])
            else:
                cn_name = title
                en_name = ""
        else:
            cn_name = race_file.stem
            en_name = ""
        
        body_start = content.find('</H1>')
        if body_start != -1:
            body_end = content.find('</body>')
            if body_end != -1:
                body_content = content[body_start:body_end]
                description = clean_html(body_content)[:2000]
            else:
                description = ""
        else:
            description = ""
        
        races.append({
            "id": f"race_{en_name.replace(' ', '_')}",
            "type": "race",
            "name": cn_name,
            "englishName": en_name,
            "description": description,
            "source": "玩家手册2024",
            "sourceFile": f"角色起源/种族/{race_file.name}",
        })
    
    print(f"[OK] 解析种族: {len(races)} 个")
    return races

def parse_classes():
    classes = []
    class_dir = BASE_DIR / "玩家手册2024" / "角色职业"
    
    if not class_dir.exists():
        print(f"[WARN] 职业目录不存在: {class_dir}")
        return classes
    
    for sub_dir in sorted(class_dir.glob("*")):
        if not sub_dir.is_dir():
            continue
        
        for class_file in sorted(sub_dir.glob("*.htm")):
            if "法术列表" in class_file.name:
                continue
            
            try:
                with open(class_file, 'rb') as f:
                    content = decode_gbk(f.read())
                
                h1_match = re.search(r'<H1[^>]*>([^<]+)</H1>', content)
                h2_match = re.search(r'<H2[^>]*>([^<]+)</H2>', content)
                
                if h1_match:
                    title = h1_match.group(1)
                elif h2_match:
                    title = h2_match.group(1)
                else:
                    title = class_file.stem
                
                title_parts = title.split(" ")
                if len(title_parts) >= 2:
                    cn_name = title_parts[0]
                    en_name = " ".join(title_parts[1:])
                else:
                    cn_name = title
                    en_name = ""
                
                body_start = content.find('</H1>') if h1_match else content.find('</H2>') if h2_match else 0
                if body_start != -1:
                    body_end = content.find('</body>')
                    if body_end != -1:
                        body_content = content[body_start:body_end]
                        description = clean_html(body_content)[:2000]
                    else:
                        description = ""
                else:
                    description = ""
                
                classes.append({
                    "id": f"class_{en_name.replace(' ', '_')}",
                    "type": "class",
                    "category": sub_dir.name,
                    "name": cn_name,
                    "englishName": en_name,
                    "description": description,
                    "source": "玩家手册2024",
                    "sourceFile": str(class_file.relative_to(BASE_DIR)),
                })
            except Exception as e:
                print(f"[ERR] 解析职业 {class_file}: {e}")
    
    print(f"[OK] 解析职业: {len(classes)} 个")
    return classes

def main():
    print("=" * 60)
    print("开始解析 D&D 5R 规则书")
    print("=" * 60)
    
    all_data = {
        "version": "1.0",
        "lastUpdated": "2026-07-11",
        "spells": [],
        "monsters": [],
        "weapons": [],
        "armor": [],
        "equipment": [],
        "feats": [],
        "magicItems": [],
        "rules": [],
        "races": [],
        "classes": [],
    }
    
    all_data["spells"] = parse_spells()
    all_data["monsters"] = parse_monsters()
    all_data["weapons"] = parse_weapons()
    all_data["armor"] = parse_armor()
    all_data["equipment"] = parse_equipment()
    all_data["feats"] = parse_feats()
    all_data["magicItems"] = parse_magic_items()
    all_data["rules"] = parse_rules()
    all_data["races"] = parse_races()
    all_data["classes"] = parse_classes()
    
    total_entries = sum(len(v) for v in all_data.values() if isinstance(v, list))
    print(f"\n[OK] 总条目数: {total_entries}")
    
    os.makedirs(OUTPUT_FILE.parent, exist_ok=True)
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n[OK] 已保存到: {OUTPUT_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    main()
