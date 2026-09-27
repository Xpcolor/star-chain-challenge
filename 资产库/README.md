# 星链视听资产库

正式人机页使用带纹理的 GLB；打开 `/asset-library.html` 可以浏览 16 级外观、精细模型、原型和声音。当前不需要补充模型。

| 资源 | 文件与来源 |
| --- | --- |
| 玩家与 16 级模型 | `dist/assets/detailed-player.glb`、`detailed-01.glb` 至 `detailed-16.glb`；用户提供 GLB，经 Blender 归一尺寸、保留纹理和六块封口分件 |
| 版本与模型映射 | `dist/assets/fleet-models.json`、`3D模型接入.json`；来源文件名、来源/运行 SHA256、字节数和分件数 |
| 宇宙背景 | `dist/assets/cosmos-v2.png`；内置 ImageGen，1672×941 |
| 玩家及 16 级舰图 | `player-cinematic-v2.png`、`enemy-tier-NN.png`；内置 ImageGen；保留作降级与生成来源 |
| 原型与缩略图 | `ship-player.glb`、`ship-NN.glb` 和同名 PNG；本地 Blender 脚本生成，保留参考 |
| 11 项音效 | `audio-*.wav`；`scripts/create-audio.mjs` 原创程序合成 |
| 环境光 | `studio-light.hdr`；Poly Haven / Greg Zaal，Studio Small 03，CC0 |
| 媒体清单 | `inventory.json`；81 项约 164.97 MB，含 SHA256；正式游戏仅按需加载当前两舰 |
| 主战场效果 | `src/presentation/scene.ts`、`hud.ts`、`audio.ts`、`fx-config.ts`；TSL、GSAP、Howler |

GLB 约定舰首 +X、上方 +Y、标准长度 6。完整舰体默认显示，`debris_*` 分件默认隐藏，零血时交换可见性。真实近看和独立侧光只用于玩家舰；敌方保留等级与战斗效果。原始生成纹理决定近距离细节上限。

复现模型预处理：

```powershell
& 'D:\app\blender\blender.exe' -b --python scripts/prepare-detailed-fleet.py -- 'C:\Users\xutao\Desktop\飞船图'
node scripts/asset-inventory.mjs
npm run verify
```

脚本验证来源哈希，不改源 GLB。旧 `create-fleet.py` 和 `render-fleet-previews.py` 只再生成原型。图像生成有随机性，正式 PNG 作为源资产保留。下坠分件是预制动画，不是实时刚体断裂。

声音在首次交互后解锁，支持静音、声部上限、左右声像。音量/混音仍需用户实际试听反馈。图鉴是单项效果演示，不等同完整游戏结算验收。

环境来源：[Studio Small 03](https://polyhaven.com/a/studio_small_03) 与 [CC0 许可](https://polyhaven.com/license)。用户提供模型按用户授权接入；本次未新增网络下载素材。Blender 仅离线制作，玩家只需浏览器。
