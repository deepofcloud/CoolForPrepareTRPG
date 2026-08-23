﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿# D and D 5e Item Data Extractor (PowerShell)
# Reads GBK-encoded HTML files and extracts item/equipment data into JSON

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Strip-Html($text) {
    if (-not $text) { return "" }
    $t = $text -replace "<[^>]+>", " "
    $t = $t -replace "&nbsp;", " "
    $t = $t -replace "&amp;", "&"
    $t = $t -replace "&lt;", "<"
    $t = $t -replace "&gt;", ">"
    $t = $t -replace "&quot;", '"'
    $t = $t -replace "\s+", " "
    return $t.Trim()
}

$items = [System.Collections.ArrayList]::new()
$BASE = "c:\Users\沉云\Desktop\备团助手\规则书\DND5e_chm-main"

$countPoison = 0
$countSiege = 0
$countFirearm = 0
$countMagic = 0
$countPlayer = 0
$countWeapon = 0
$countArmor = 0
$countArtisan = 0
$countAdventure = 0

# ==========================================
# 1. Player Handbook Equipment
# ==========================================
Write-Host "=== Parsing Player Handbook Chapter 6 ==="
$phbPath = Join-Path $BASE "玩家手册2024\第六章：装备.htm"
if (Test-Path $phbPath) {
    $raw = Get-Content $phbPath -Encoding Default -Raw
    Write-Host "  File is header/intro only, no item entries."
}

# ==========================================
# 2. Parse Weapons (玩家手册)
# ==========================================
Write-Host "=== Parsing Weapons ==="
$weaponPath = Join-Path $BASE "玩家手册2024\装备\武器.htm"
if (Test-Path $weaponPath) {
    $raw = Get-Content $weaponPath -Encoding Default -Raw

    # Match TR rows with 6 TD cells (skip colspan=6 category headers)
    $wpnRowPattern = "<TR[^>]*>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*</TR>"
    $wpnMatches = [regex]::Matches($raw, $wpnRowPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($m in $wpnMatches) {
        $nameCell = Strip-Html($m.Groups[1].Value).Trim()
        $damage = Strip-Html($m.Groups[2].Value).Trim()
        $props = Strip-Html($m.Groups[3].Value).Trim()
        $mastery = Strip-Html($m.Groups[4].Value).Trim()
        $weight = Strip-Html($m.Groups[5].Value).Trim()
        $price = Strip-Html($m.Groups[6].Value).Trim()

        # Skip header row and empty rows
        if ($nameCell -match "^名称$|^物品$|^\s*$") { continue }
        if ($nameCell.Length -lt 2) { continue }

        $desc = "伤害：$damage；属性：$props；精通：$mastery；重量：$weight；价格：$price"
        [void]$items.Add([PSCustomObject]@{name=$nameCell; category="武器"; description=$desc; source="玩家手册"})
        $countWeapon++
    }
}
Write-Host "  Extracted $countWeapon weapons"

# ==========================================
# 3. Parse Armor (玩家手册)
# ==========================================
Write-Host "=== Parsing Armor ==="
$armorPath = Join-Path $BASE "玩家手册2024\装备\护甲.htm"
if (Test-Path $armorPath) {
    $raw = Get-Content $armorPath -Encoding Default -Raw

    $armRowPattern = "<TR[^>]*>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*</TR>"
    $armMatches = [regex]::Matches($raw, $armRowPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

    foreach ($m in $armMatches) {
        $nameCell = Strip-Html($m.Groups[1].Value).Trim()
        $ac = Strip-Html($m.Groups[2].Value).Trim()
        $strength = Strip-Html($m.Groups[3].Value).Trim()
        $stealth = Strip-Html($m.Groups[4].Value).Trim()
        $weight = Strip-Html($m.Groups[5].Value).Trim()
        $price = Strip-Html($m.Groups[6].Value).Trim()

        # Skip header row
        if ($nameCell -match "^名称$|^物品$|^\s*$") { continue }
        if ($nameCell.Length -lt 2) { continue }

        $desc = "护甲等级：$ac；力量：$strength；潜行：$stealth；重量：$weight；价格：$price"
        [void]$items.Add([PSCustomObject]@{name=$nameCell; category="护甲"; description=$desc; source="玩家手册"})
        $countArmor++
    }
}
Write-Host "  Extracted $countArmor armor items"

# ==========================================
# 4. Parse Artisan's Tools (玩家手册)
# ==========================================
Write-Host "=== Parsing Artisan's Tools ==="
$artisanPath = Join-Path $BASE "玩家手册2024\装备\工匠工具.htm"
if (Test-Path $artisanPath) {
    $raw = Get-Content $artisanPath -Encoding Default -Raw

    # Match each tool block: <p><b><FONT color=#800000>Name (Price)</FONT></b> ... </table>
    $toolPattern = "<p>\s*<b>\s*<FONT\s+color=#800000>([^<]+)</FONT>\s*</b>\s*(.*?)(?=\s*<p>|</body>|\z)"
    $toolMatches = [regex]::Matches($raw, $toolPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($m in $toolMatches) {
        $nameRaw = $m.Groups[1].Value.Trim()
        $restContent = $m.Groups[2].Value

        if (-not $nameRaw) { continue }
        if ($nameRaw -match "工匠工具|Artisan") { continue }

        $name = Strip-Html($nameRaw).Trim()
        $name = $name -replace "\s+", " "

        # Extract Chinese name (before English)
        $nameCn = ""
        if ($name -match "^(.+?)\s+[A-Za-z]") {
            $nameCn = $Matches[1].Trim()
        } else {
            $nameCn = $name
        }

        # Build description from table rows
        $descParts = @()
        # Match table row: <td ...><b>属性：</b>敏捷</td> or <td colspan=2><b>使用：</b>...</td>
        $tdPattern = "<td[^>]*>\s*<b>([^：:]+)[：:]\s*</b>\s*(.+?)\s*</td>"
        $tdMatches = [regex]::Matches($restContent, $tdPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
        foreach ($td in $tdMatches) {
            $key = Strip-Html($td.Groups[1].Value).Trim()
            $val = Strip-Html($td.Groups[2].Value).Trim()
            $descParts += "$key：$val"
        }

        $desc = ($descParts -join "；")

        if ($nameCn -and $desc.Length -gt 2) {
            [void]$items.Add([PSCustomObject]@{name=$nameCn; category="工匠工具"; description=$desc; source="玩家手册"})
            $countArtisan++
        }
    }
}
Write-Host "  Extracted $countArtisan artisan tools"

# ==========================================
# 5. Parse Adventuring Gear (玩家手册)
# ==========================================
Write-Host "=== Parsing Adventuring Gear ==="
$adventurePath = Join-Path $BASE "玩家手册2024\装备\冒险装备.htm"
if (Test-Path $adventurePath) {
    $raw = Get-Content $adventurePath -Encoding Default -Raw

    # Phase A: Parse detailed description entries (<P><STRONG><FONT color=#800000>)
    # These take priority over table entries
    $detailNames = @{}
    $adDetailPattern = "<P[^>]*>\s*(<STRONG>\s*<FONT\s+color=#800000>[^<]*</FONT>\s*</STRONG>|<FONT\s+color=#800000>\s*<STRONG>[^<]*</STRONG>\s*</FONT>)\s*(.*?)(?=<P[^>]*>\s*(<STRONG>\s*<FONT\s+color=#800000>|<FONT\s+color=#800000>\s*<STRONG>)|</body>)"
    $adMatches = [regex]::Matches($raw, $adDetailPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($m in $adMatches) {
        $fullBlock = $m.Groups[0].Value
        $afterName = $m.Groups[2].Value

        # Extract name from STRONG/FONT
        $nameRaw = ""
        if ($fullBlock -match "<FONT\s+color=#800000>\s*<STRONG>\s*(.+?)\s*</STRONG>") {
            $nameRaw = $Matches[1].Trim()
        } elseif ($fullBlock -match "<STRONG>\s*<FONT\s+color=#800000>\s*(.+?)\s*</FONT>") {
            $nameRaw = $Matches[1].Trim()
        }

        if (-not $nameRaw) { continue }
        if ($nameRaw -match "冒险装备|Adventuring Gear") { continue }

        $name = Strip-Html($nameRaw).Trim()
        $name = $name -replace "\s+", " "

        # Extract Chinese name and price
        $nameCn = ""
        if ($name -match "^(.+?)\s+[A-Za-z]") {
            $nameCn = $Matches[1].Trim()
        } else {
            $nameCn = $name
        }

        # Build description from <BR> onwards
        $descText = $afterName -replace "<STRONG>\s*<FONT[^>]*>[^<]*</FONT>\s*</STRONG>", ""
        $descText = $descText -replace "<FONT[^>]*>\s*<STRONG>[^<]*</STRONG>\s*</FONT>", ""
        $descText = $descText -replace "<STRONG>\s*<FONT[^>]*>[^<]*</FONT>", ""
        $descText = $descText -replace "<FONT[^>]*>\s*<STRONG>[^<]*</STRONG>", ""
        $desc = Strip-Html($descText)
        $desc = $desc -replace "\s+", " "
        $desc = $desc.Trim()

        # Check for BLOCKQUOTE sub-tables
        $subItems = @()
        if ($afterName -match "<BLOCKQUOTE>(.+?)</BLOCKQUOTE>") {
            $blockquoteContent = $Matches[1]
            # Extract sub-table rows
            $subTrPattern = "<TR[^>]*>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>(?:\s*<TD[^>]*>\s*(.+?)\s*</TD>)?(?:\s*<TD[^>]*>\s*(.+?)\s*</TD>)?(?:\s*<TD[^>]*>\s*(.+?)\s*</TD>)?\s*</TR>"
            $subTrMatches = [regex]::Matches($blockquoteContent, $subTrPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
            foreach ($str in $subTrMatches) {
                $subName = Strip-Html($str.Groups[1].Value).Trim()
                if ($subName -match "^类型$|^物品$|^名称$|^\s*$") { continue }
                if ($subName.Length -lt 1) { continue }

                $subCols = @()
                for ($si = 2; $si -le 5; $si++) {
                    $sv = Strip-Html($str.Groups[$si].Value).Trim()
                    if ($sv) { $subCols += $sv }
                }
                $subDesc = ($subCols -join "；")
                if ($subDesc.Length -gt 0) {
                    $subItems += [PSCustomObject]@{name=$subName; category="冒险装备"; description=$subDesc; source="玩家手册"}
                }
            }
        }

        if ($nameCn -and $desc.Length -gt 1) {
            [void]$items.Add([PSCustomObject]@{name=$nameCn; category="冒险装备"; description=$desc; source="玩家手册"})
            $detailNames[$nameCn] = $true
            $countAdventure++
            
            # Also add sub-items if present
            foreach ($si in $subItems) {
                [void]$items.Add($si)
                $detailNames[$si.name] = $true
                $countAdventure++
            }
        }
    }

    # Phase B: Parse the big 7-column table (two items per row)
    # Skip items already in $detailNames (Phase A preferred)
    $adTablePattern = "<TR[^>]*>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.*?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*</TR>"
    $adTableMatches = [regex]::Matches($raw, $adTablePattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($m in $adTableMatches) {
        # Left item: cells 1-3
        $leftName = Strip-Html($m.Groups[1].Value).Trim()
        $leftWeight = Strip-Html($m.Groups[2].Value).Trim()
        $leftPrice = Strip-Html($m.Groups[3].Value).Trim()
        # Cell 4 is separator (empty)
        # Right item: cells 5-7
        $rightName = Strip-Html($m.Groups[5].Value).Trim()
        $rightWeight = Strip-Html($m.Groups[6].Value).Trim()
        $rightPrice = Strip-Html($m.Groups[7].Value).Trim()

        # Process left item
        if ($leftName -and $leftName -notmatch "^物品$|^\s*$" -and $leftName.Length -ge 1) {
            if (-not $detailNames.ContainsKey($leftName)) {
                $leftDesc = "重量：$leftWeight；价格：$leftPrice"
                [void]$items.Add([PSCustomObject]@{name=$leftName; category="冒险装备"; description=$leftDesc; source="玩家手册"})
                $detailNames[$leftName] = $true
                $countAdventure++
            }
        }

        # Process right item
        if ($rightName -and $rightName -notmatch "^物品$|^\s*$" -and $rightName.Length -ge 1) {
            if (-not $detailNames.ContainsKey($rightName)) {
                $rightDesc = "重量：$rightWeight；价格：$rightPrice"
                [void]$items.Add([PSCustomObject]@{name=$rightName; category="冒险装备"; description=$rightDesc; source="玩家手册"})
                $detailNames[$rightName] = $true
                $countAdventure++
            }
        }
    }
}
Write-Host "  Extracted $countAdventure adventuring gear items"

# ==========================================
# 6. Parse Poisons
# ==========================================
Write-Host "=== Parsing Poisons ==="
$poisonPath = Join-Path $BASE "城主指南2024\3.地下城主工具箱\毒药.htm"
$raw = Get-Content $poisonPath -Encoding Default -Raw

$chunks = [regex]::Matches($raw, "<P[^>]*>(.*?)(?=<P[ >]|</body>|</html>)", [System.Text.RegularExpressions.RegexOptions]::Singleline)

foreach ($c in $chunks) {
    $content = $c.Groups[1].Value
    
    $hasFontStrong = ($content -match "<FONT\s+color=#800000>\s*<STRONG>") -or ($content -match "<STRONG>\s*<FONT\s+color=#800000>")
    $isHeader = $content -match "size\s*=\s*5" -or $content -match "size\s*=\s*4"
    
    if ($hasFontStrong -and -not $isHeader) {
        $nameRaw = ""
        if ($content -match "<STRONG>\s*<FONT[^>]*>(.+?)</FONT>") {
            $nameRaw = $Matches[1].Trim()
        } elseif ($content -match "<FONT[^>]*>\s*<STRONG>(.+?)</STRONG>") {
            $nameRaw = $Matches[1].Trim()
        }
        
        if (-not $nameRaw) { continue }
        
        # Skip section headers
        if ($nameRaw -match "范例毒药|Sample Poisons|采购毒药|Purchasing|毒药的提取|Harvesting") { continue }
        
        # Extract name, strip price
        $name = $nameRaw -replace "\s*（\d+GP）\s*", ""
        $name = $name -replace "\s*\(\d+GP\)\s*", ""
        $name = $name.Trim()
        
        # Extract type from EM
        $type = ""
        if ($content -match "<EM>(.+?)</EM>") {
            $type = Strip-Html($Matches[1]).Trim()
        }
        
        # Build description
        $desc = $content -replace "<STRONG>\s*<FONT[^>]*>[^<]*</FONT>\s*(<BR>)?\s*</STRONG>", ""
        $desc = $desc -replace "<FONT[^>]*>\s*<STRONG>[^<]*</STRONG>\s*</FONT>", ""
        $desc = $desc -replace "<BR>\s*<EM>[^<]*</EM>", ""
        $desc = Strip-Html($desc)
        $desc = $desc -replace "\s+", " "
        $desc = $desc.Trim()
        
        if ($name -and $desc.Length -gt 1) {
            $fullDesc = if ($type) { "$type。$desc" } else { $desc }
            [void]$items.Add([PSCustomObject]@{name=$name; category="毒药"; description=$fullDesc; source="城主指南"})
            $countPoison++
        }
    }
}
Write-Host "  Extracted $countPoison poisons"

# ==========================================
# 7. Parse Siege Equipment
# ==========================================
Write-Host "=== Parsing Siege Equipment ==="
$siegePath = Join-Path $BASE "城主指南2024\3.地下城主工具箱\攻城装备.htm"
$raw = Get-Content $siegePath -Encoding Default -Raw

$chunks = [regex]::Matches($raw, "<P[^>]*>(.*?)(?=<P[ >]|</body>|</html>)", [System.Text.RegularExpressions.RegexOptions]::Singleline)

$lastSiegeName = ""
foreach ($c in $chunks) {
    $content = $c.Groups[1].Value
    
    $hasFontStrong = ($content -match "<FONT\s+color=#800000>\s*<STRONG>") -or ($content -match "<STRONG>\s*<FONT\s+color=#800000>")
    $isHeader = $content -match "size\s*=\s*5"
    
    if ($hasFontStrong -and -not $isHeader) {
        $nameRaw = ""
        if ($content -match "<STRONG>\s*<FONT[^>]*>(.+?)</FONT>") {
            $nameRaw = $Matches[1].Trim()
        } elseif ($content -match "<FONT[^>]*>\s*<STRONG>(.+?)</STRONG>") {
            $nameRaw = $Matches[1].Trim()
        }
        
        if (-not $nameRaw) { continue }
        if ($nameRaw -match "攻城装备|Siege Equipment") { continue }
        
        $name = Strip-Html($nameRaw).Trim()
        $name = $name -replace "\s+", " "
        
        $type = ""
        if ($content -match "<EM>(.+?)</EM>") {
            $type = Strip-Html($Matches[1]).Trim()
        }
        
        $desc = $content -replace "<STRONG>\s*<FONT[^>]*>[^<]*</FONT>\s*(<BR>)?\s*</STRONG>", ""
        $desc = $desc -replace "<FONT[^>]*>\s*<STRONG>[^<]*</STRONG>\s*</FONT>", ""
        $desc = $desc -replace "<BR>\s*<EM>[^<]*</EM>", ""
        $desc = Strip-Html($desc)
        $desc = $desc -replace "\s+", " "
        $desc = $desc.Trim()
        
        if ($name -and $desc.Length -gt 1) {
            $fullDesc = if ($type) { "$type。$desc" } else { $desc }
            [void]$items.Add([PSCustomObject]@{name=$name; category="攻城装备"; description=$fullDesc; source="城主指南"})
            $countSiege++
            $lastSiegeName = $name
        }
    } elseif ($lastSiegeName -and $content -notmatch "<FONT|<STRONG>|<EM>|<TABLE") {
        $extraDesc = Strip-Html($content).Trim()
        $extraDesc = $extraDesc -replace "\s+", " "
        if ($extraDesc.Length -gt 5) {
            for ($i = $items.Count - 1; $i -ge 0; $i--) {
                if ($items[$i].name -eq $lastSiegeName) {
                    $items[$i].description = $items[$i].description + " " + $extraDesc
                    break
                }
            }
        }
    }
}
Write-Host "  Extracted $countSiege siege equipment items"

# ==========================================
# 8. Parse Firearms & Explosives
# ==========================================
Write-Host "=== Parsing Firearms and Explosives ==="
$gunsPath = Join-Path $BASE "城主指南2024\3.地下城主工具箱\枪械与爆炸物.htm"
$raw = Get-Content $gunsPath -Encoding Default -Raw

# 4a. Firearms from TABLE (5 columns)
$table5col = "<TR[^>]*>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*<TD[^>]*>\s*(.+?)\s*</TD>\s*</TR>"
$tableMatches = [regex]::Matches($raw, $table5col, [System.Text.RegularExpressions.RegexOptions]::Singleline)

foreach ($m in $tableMatches) {
    $nameCell = Strip-Html($m.Groups[1].Value).Trim()
    $damage = Strip-Html($m.Groups[2].Value).Trim()
    $props = Strip-Html($m.Groups[3].Value).Trim()
    $mastery = Strip-Html($m.Groups[4].Value).Trim()
    $weight = Strip-Html($m.Groups[5].Value).Trim()
    
    if ($nameCell -match "^现代|^未来|^军用|^Martial|^物品$|^伤害$|^\s*$") { continue }
    if ($nameCell.Length -lt 2) { continue }
    
    $desc = "伤害：$damage；词条：$props；精通：$mastery；重量：$weight"
    [void]$items.Add([PSCustomObject]@{name=$nameCell; category="枪械"; description=$desc; source="城主指南"})
    $countFirearm++
}

# 4b. Explosives from P with STRONG
$explChunks = [regex]::Matches($raw, "<P[^>]*>\s*<STRONG>([^<]+)</STRONG>(.*?)(?=<P[ >]|<H3|<TABLE\s|</body>|</html>)", [System.Text.RegularExpressions.RegexOptions]::Singleline)

foreach ($c in $explChunks) {
    $nameRaw = $c.Groups[1].Value.Trim()
    $rest = $c.Groups[2].Value
    
    if ($nameRaw -match "枪械|Firearms|爆炸物|Explosives|弹药|Ammunition|词条|Properties|扫射|Burst|换弹|Reload") {
        continue
    }
    
    $name = Strip-Html($nameRaw).Trim()
    if ($name.Length -lt 2) { continue }
    
    $desc = Strip-Html($rest).Trim()
    $desc = $desc -replace "\s+", " "
    
    if ($desc.Length -gt 5) {
        [void]$items.Add([PSCustomObject]@{name=$name; category="爆炸物"; description=$desc; source="城主指南"})
        $countFirearm++
    }
}

# 4c. Explosives TABLE (3 columns)
$table3col = "<TR[^>]*>\s*<TD[^>]*>\s*([^<]+)\s*</TD>\s*<TD[^>]*>\s*([^<]*)\s*</TD>\s*<TD[^>]*>\s*([^<]*)\s*</TD>\s*</TR>"
$table3Matches = [regex]::Matches($raw, $table3col, [System.Text.RegularExpressions.RegexOptions]::Singleline)
foreach ($m in $table3Matches) {
    $tname = Strip-Html($m.Groups[1].Value).Trim()
    $price = Strip-Html($m.Groups[2].Value).Trim()
    $weight = Strip-Html($m.Groups[3].Value).Trim()
    
    if ($tname -match "^物品$|^价格$|^重量$|^\s*$") { continue }
    
    $exists = $false
    foreach ($i in $items) { if ($i.name -eq $tname) { $exists = $true; break } }
    if (-not $exists) {
        [void]$items.Add([PSCustomObject]@{name=$tname; category="爆炸物"; description="价格：$price；重量：$weight"; source="城主指南"})
        $countFirearm++
    }
}

Write-Host "  Extracted $countFirearm firearms/explosives items"

# ==========================================
# 9. Parse Magic Items
# ==========================================
Write-Host "=== Parsing Magic Items ==="
$magicBase = Join-Path $BASE "城主指南2024\7.宝藏\魔法物品详述"
$magicFiles = Get-ChildItem $magicBase -Filter "*.htm" -Recurse

foreach ($file in $magicFiles) {
    $raw = Get-Content $file.FullName -Encoding Default -Raw
    
    $relativePath = $file.FullName.Substring($magicBase.Length + 1)
    $pathParts = $relativePath -split "\\"
    $category = $pathParts[0]
    
    if ($category -eq "魔法物品详述.htm") { continue }
    
    $h6Pattern = "<H6[^>]*id=`"([^`"]*)`"[^>]*>\s*(.+?)\s*</H6>\s*(.*?)(?=<H6[^>]*id=|</body>|</html>|\z)"
    $h6Matches = [regex]::Matches($raw, $h6Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
    
    foreach ($m in $h6Matches) {
        $h6Text = $m.Groups[2].Value
        $bodyContent = $m.Groups[3].Value
        
        $h6Clean = Strip-Html($h6Text).Trim()
        $nameCn = ""
        if ($h6Clean -match "^(.+?)\s+([A-Za-z].+)$") {
            $nameCn = $Matches[1].Trim()
        } else {
            $nameCn = $h6Clean
        }
        
        $fullDesc = Strip-Html($bodyContent).Trim()
        $fullDesc = $fullDesc -replace "\s+", " "
        
        if ($nameCn -and $fullDesc.Length -gt 2) {
            [void]$items.Add([PSCustomObject]@{name=$nameCn; category=$category; description=$fullDesc; source="城主指南"})
            $countMagic++
        }
    }
}
Write-Host "  Extracted $countMagic magic items"

# ==========================================
# Deduplicate
# ==========================================
Write-Host "=== Deduplicating ==="
$before = $items.Count

$seen = @{}
$deduped = [System.Collections.ArrayList]::new()
foreach ($it in $items) {
    if (-not $seen.ContainsKey($it.name)) {
        $seen[$it.name] = $true
        [void]$deduped.Add($it)
    }
}
$items = $deduped
Write-Host "  Before: $before, After: $($items.Count) (removed $($before - $items.Count) duplicates)"

# ==========================================
# Output JSON
# ==========================================
Write-Host "=== Writing JSON ==="
$outputPath = "c:\Users\沉云\Desktop\备团助手\item_database.json"

$sorted = $items | Sort-Object category, name
$json = $sorted | ConvertTo-Json -Depth 3 -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)

Write-Host "=== Summary ==="
Write-Host "Weapons: $countWeapon"
Write-Host "Armor: $countArmor"
Write-Host "Artisan's Tools: $countArtisan"
Write-Host "Adventuring Gear: $countAdventure"
Write-Host "Poisons: $countPoison"
Write-Host "Siege Equipment: $countSiege"  
Write-Host "Firearms and Explosives: $countFirearm"
Write-Host "Magic Items: $countMagic"
Write-Host "Player Handbook: $countPlayer"
Write-Host "Total items (after dedup): $($items.Count)"
Write-Host "Output: $outputPath"

