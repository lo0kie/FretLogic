#!/usr/bin/env python3
"""从 Sarasa Gothic 官方 TTF 生成乐谱字体子集（data/fonts/*.woff2）。

【为什么要子集化】
完整 Sarasa Mono SC 的三个字重共 73MB，不可能随包分发。乐谱实际用到的字符集合是有限的，
子集后三个字重合计约 3.1MiB。

【子集范围的依据】每一条都对应 scoreExportLayout 的排版模型，不是随手挑的区间：
- ASCII（charCode <= 127）走半角列宽，必须**完整覆盖** —— 缺一个字符就会回落到别的字体，
  而回落字体的推进宽不是 0.5em，会直接破坏「列宽 = 逐字推进宽 + 固定字间隙」这条等式。
- 汉字走全角列宽（假设推进宽恰为 1em）。缺字同样会回落，但**任何中文字体的全角字推进宽都是
  1em**，所以汉字缺字只影响字形风格、不破坏栅格 —— 汉字做有损子集是安全的，这里取 GB2312
  全集（6763 个汉字 + 其符号区）覆盖绝大多数歌词。
- U+2600-26FF 含 ♯(U+266F) / ♭(U+266D) / ♮(U+266E)，和弦名的升降还原号走这三个码位。
- 去 hinting：歌词实际渲染字号是 23px × PIXEL_RATIO（约 46~69px），这个尺度下 hinting 不起
  作用，去掉可省约 35% 体积。

【依赖】pip install fonttools brotli

【用法】
  1. 取官方 TTF：https://github.com/be5invis/Sarasa-Gothic/releases 的 SarasaMonoSC-TTF-<ver>.7z
     解包后应得到 SarasaMonoSC-Light.ttf / SarasaMonoSC-Regular.ttf / SarasaMonoSC-Bold.ttf
  2. python scripts/build-font-subset.py --source-dir <解包目录>
  3. 产物写入仓库 data/fonts/，由 src/domains/score/preview/services/scoreFonts.ts 装载（同族名
     "Sarasa Mono SC"）——页面与渲染 Worker 各有自己的 FontFaceSet，两个环境都要注册

【授权】Sarasa Gothic 为 SIL OFL 1.1。脚本用 --name-IDs=* 保留字体内的版权与许可记录，
分发时随附 OFL 说明即可。
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

REPO_ROOT = Path(__file__).resolve().parent.parent

# 逐段列举要保留的码位区间
RANGES: list[tuple[int, int]] = [
    (0x0000, 0x00FF),  # Basic Latin + Latin-1 Supplement
    (0x0100, 0x017F),  # Latin Extended-A
    (0x0180, 0x024F),  # Latin Extended-B（越南语等，歌名偶见）
    (0x2000, 0x206F),  # General Punctuation（— – … “ ” ‘ ’）
    (0x2070, 0x209F),  # 上下标
    (0x20A0, 0x20BF),  # Currency（¥ € £）
    (0x2100, 0x214F),  # Letterlike（™ № ℃）
    (0x2190, 0x21FF),  # Arrows
    (0x2200, 0x22FF),  # Math Operators
    (0x2500, 0x257F),  # Box Drawing
    (0x25A0, 0x25FF),  # Geometric Shapes
    (0x2600, 0x26FF),  # Misc Symbols（♯ ♭ ♮ ♪ ♫ ★）
    (0x3000, 0x303F),  # CJK Symbols and Punctuation（。、〈〉《》「」）
    (0xFE30, 0xFE4F),  # CJK Compatibility Forms
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms（全角 ASCII）
    (0x1D100, 0x1D1FF),  # Musical Symbols（五线谱记号，字体没有则静默跳过）
]

WEIGHTS = ('Light', 'Regular', 'Bold')


def build_unicodes() -> set[str]:
    """码位全集：显式区间 + GB2312 可解码出的全部字符。"""
    chars: set[str] = set()
    for lo, hi in RANGES:
        chars.update(chr(cp) for cp in range(lo, hi + 1))

    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return chars


def subset_weight(source_dir: Path, out_dir: Path, weight: str, wanted: set[int]) -> int:
    src = source_dir / f'SarasaMonoSC-{weight}.ttf'
    if not src.exists():
        raise FileNotFoundError(f'缺少字重文件：{src}')
    out = out_dir / f'SarasaMonoSC-{weight}.woff2'

    # 先与源字体 cmap 求交：请求字体本来就没有的码位只会白白撑大 subset 请求
    font = TTFont(src, lazy=True)
    available: set[int] = set()
    for table in font['cmap'].tables:
        available.update(table.cmap.keys())
    font.close()

    hit = sorted(wanted & available)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.desubroutinize = False
    opts.layout_features = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = False
    # 保留全部 name 记录：OFL 要求字体内的版权与许可声明随字体一同分发
    opts.name_IDs = ['*']
    opts.name_legacy = True
    opts.name_languages = ['*']
    opts.drop_tables = ['DSIG']
    opts.unicodes = hit

    started = time.time()
    font = subset.load_font(src, opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=hit)
    subsetter.subset(font)
    subset.save_font(font, out, opts)
    font.close()

    size = out.stat().st_size
    print(
        f'{out.name:<28} {size:>10,} B   '
        f'（请求 {len(wanted)} 码位，实有 {len(hit)}，缺 {len(wanted) - len(hit)}）'
        f'  {time.time() - started:.1f}s'
    )
    return size


def main() -> int:
    parser = argparse.ArgumentParser(description='生成歌词字体子集（data/fonts/*.woff2）')
    parser.add_argument('--source-dir', required=True, help='解包后的 SarasaMonoSC TTF 所在目录')
    parser.add_argument('--out-dir', default=str(REPO_ROOT / 'data' / 'fonts'), help='输出目录')
    args = parser.parse_args()

    source_dir = Path(args.source_dir).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    wanted = {ord(c) for c in build_unicodes()}
    print(f'码位请求集合：{len(wanted)} 个  →  {out_dir}')

    total = 0
    for weight in WEIGHTS:
        total += subset_weight(source_dir, out_dir, weight, wanted)
    print(f'合计 {total:,} B = {total / 1048576:.2f} MiB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
