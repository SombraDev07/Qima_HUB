"""Gera os ícones do app a partir do "Q" da marca QIMA (mesmas medidas de public/favicon.svg).

Rodar da pasta app:  python scripts/gerar-icones.py
O Q do SVG (viewBox 0 0 92 92): anel com centro (43.012, 43.012), raio externo 43.081 e interno 28.71,
mais a perna diagonal com 14.3 de espessura e ponta arredondada (centro 84.15, 84.15).
"""
from pathlib import Path
from PIL import Image, ImageDraw

VERMELHO = (228, 0, 43, 255)   # #e4002b
BRANCO = (255, 255, 255, 255)
PASTA = Path(__file__).resolve().parent.parent / 'assets'
SS = 4  # desenha 4x maior e reduz, para a borda sair lisa


def desenhar_q(tamanho, lado_q, cor, fundo=(0, 0, 0, 0)):
    """Imagem quadrada `tamanho` com o Q ocupando `lado_q` px (caixa 0..92 do SVG), centrado."""
    W = tamanho * SS
    esc = lado_q * SS / 92.0
    ox = oy = (W - 92.0 * esc) / 2  # centraliza a caixa do desenho
    P = lambda x, y: (ox + x * esc, oy + y * esc)

    mascara = Image.new('L', (W, W), 0)
    d = ImageDraw.Draw(mascara)
    cx, cy = P(43.012, 43.012)
    r_ext, r_int = 43.081 * esc, 28.71 * esc
    d.ellipse([cx - r_ext, cy - r_ext, cx + r_ext, cy + r_ext], fill=255)
    # perna diagonal: retângulo girado + ponta redonda
    d.polygon([P(78.039, 67.927), P(89.206, 79.093), P(79.093, 89.206), P(67.927, 78.039)], fill=255)
    px, py = P(84.1495, 84.1495)
    rp = 7.15 * esc
    d.ellipse([px - rp, py - rp, px + rp, py + rp], fill=255)
    # furo do anel
    d.ellipse([cx - r_int, cy - r_int, cx + r_int, cy + r_int], fill=0)

    img = Image.new('RGBA', (W, W), fundo)
    img.paste(Image.new('RGBA', (W, W), cor), (0, 0), mascara)
    return img.resize((tamanho, tamanho), Image.LANCZOS)


def salvar(img, nome, modo=None):
    if modo:
        img = img.convert(modo)
    img.save(PASTA / nome, optimize=True)
    print(f'{nome}: {img.size[0]}x{img.size[1]}')


# ícone comum (lojas, Android antigo): Q vermelho sobre branco, com folga nas bordas
salvar(desenhar_q(1024, 600, VERMELHO, BRANCO), 'icon.png', 'RGB')
# ícone adaptativo (Android 8+): o sistema recorta em círculo/gota, então o Q fica dentro da zona segura (66% do centro)
salvar(desenhar_q(1024, 470, VERMELHO), 'android-icon-foreground.png')
salvar(Image.new('RGBA', (1024, 1024), BRANCO), 'android-icon-background.png')
# ícone monocromático (Android 13+, ícones temáticos): só a forma, o sistema pinta
salvar(desenhar_q(1024, 470, BRANCO), 'android-icon-monochrome.png')
# abertura e favicon (web)
salvar(desenhar_q(1024, 420, VERMELHO), 'splash-icon.png')
salvar(desenhar_q(48, 40, VERMELHO), 'favicon.png')
