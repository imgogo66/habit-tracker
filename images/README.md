# images/

這個資料夾放網站用到的圖片，程式裡一律用**相對路徑**引用，例如 `images/logo.svg`。

| 檔案 | 用途 | 被誰引用 |
| --- | --- | --- |
| `favicon.svg` | 瀏覽器分頁小圖示 | `index.html` 的 `<link rel="icon">` |
| `logo.svg` | 左上角的品牌圖示 | `index.html` 的 `<img class="brand-mark">` |
| `wood-texture.svg` | 背景的木紋顆粒質感 | `css/style.css` 的 `body { background-image }` |

## 想換成自己的圖？

1. 把圖片丟進這個資料夾（建議檔名用英文、小寫、不要空格，例如 `my-logo.png`）。
2. 去對應的檔案改路徑：
   - 換 logo → 改 `index.html` 裡的 `src="images/logo.svg"`
   - 換背景 → 改 `css/style.css` 裡的 `url("../images/wood-texture.svg")`
     （注意 CSS 在 `css/` 資料夾裡，所以要用 `../images/` 往上跳一層）
3. 重新整理瀏覽器就看得到了。

> 圖片檔名有大小寫之分。本機 Mac 不分大小寫，但 GitHub Pages 會分，
> 所以 `Logo.PNG` 和 `logo.png` 在線上是兩個不同的檔案，記得對齊。
