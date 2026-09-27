# 浮光座舱：独立 3D 视觉样板

更新：2026-09-27。此页是表现层样板，尚未替换正式人机游戏。

## 当前交付

- 本地预览：http://127.0.0.1:8788/visual-sample.html
- 强制兼容后端：http://127.0.0.1:8788/visual-sample.html?backend=webgl
- 用户已明确认可特效和真实 3D 方向，继续提供剩余模型；最新修改是三处卡牌等大、辅助文字调大，框体尺寸保持不变。
- 源码：dist/visual-sample.html、visual-sample.css、visual-sample.mjs；scripts/prepare-renderer.mjs 本地打包 Three.js，生成忽略入库的 visual-sample.bundle.mjs。
- 保留原游戏的规则、回放和记录。此页展示的生命、手牌、攻击与回血只是演示状态，不是完整可玩的对局。

## 外观与交互

一个全屏 3D 场景包含背景、飞船、立体碎石与星尘。移除上方舱框，保留下方两侧舱框。透明 HUD 由清晰 DOM 字体承载；左右信息等分三项，每个大区域仅两条较长电弧追逐，小项不加电弧。

现有演示包括飞入、单发/三连攻击、命中护盾、全场景局部折射、1 点/3 点修复环、胜利信号、零血完整舰体陨落、近看转向、侧光切换与 2.5D 对比。默认静音，复用项目已有音效。三处牌面共用宽高、字体、材质及角标；小字号统一提升，低高度屏幕单独调整内部间距。

右上角恢复“记录与难度”“玩法说明”入口，在新标签页打开原人机游戏的对应真实面板，保留样板页面。复用已有 `?records=1` 入口；app.mjs 仅增加 `?help=1` 自动打开既有说明书，不复制另一份规则文本或记录设置。两条入口的目标面板已在本地浏览器验证。

修复了 renderer 初始化尚未完成时窗口 resize 访问未创建 camera 的异常。

## 新模型及原图

| 输入文件 | 样板资产 | 对应外形 |
| --- | --- | --- |
| Desktop/飞船图/futuristic spaceship 3d model.glb | dist/assets/tripo-sample-1.glb | 敌方 08 级流光双擎突击舰 |
| Desktop/飞船图/futuristic spaceship 3d model2.glb | dist/assets/tripo-sample-2.glb | 我方曙光双翼巡航舰 |

对应关系依据嵌入纹理外观比对。两者均为单网格、内嵌颜色贴图的 GLB；运行时加入金属/粗糙度参数和基于颜色的发光遮罩，没有声称输入包含完整的 PBR 贴图组。导入文件保持原样。

17 张原图已复制到 `资产库/3D转换原图/`，用舰船名称及等级命名。用户已继续将新增 GLB 放入 Desktop/飞船图；本次已检查文件和贴图结构，存在重复下载版本。新增舰船的等级映射及整套接入尚未完成，不能再把未接入等同于未提供。

真实转向与侧面受光已实现；**装甲预切、内部截面、独立部件破损尚未实现**。当前陨落是完整舰体运动加通用粒子，并非结构化解体。整套精细模型和正式对局接入仍待后续。

## 渲染路线的确定结论

新表现层选用 **WebGPURenderer + TSL + RenderPipeline**，保留 WebGL 2 后端回退。当前本地 Three.js 为 0.186.1。新样板用一个渲染器和动画循环，场景 MRT 分离颜色与发光，只让发光通道参与 bloom，避免白色装甲整体泛白。

旧 ShaderMaterial、onBeforeCompile 和传统 EffectComposer 不能直接迁入此渲染器，要改为节点材质/TSL 后处理。正式游戏逐步迁移，不混接两个后处理系统。WebGPU 本身不保证视觉或帧率提升；此选择便于今后统一着色和渲染扩展，具体性能仍需目标设备实测。联网边界仍是规则与结算事件，和使用哪种渲染后端相互独立。

2026-09-27 核对的官方资料：

- [Three.js WebGPURenderer 迁移说明](https://threejs.org/manual/pages/webgpurenderer)：仍标为实验性，说明材质与后处理兼容边界及性能注意事项。
- [RenderPipeline API](https://threejs.org/docs/pages/RenderPipeline.html)
- [WebGPURenderer 源码](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgpu/WebGPURenderer.js)：支持 forceWebGL 和后端回退；本地已安装源码亦已核对。
- [TSL 官方说明](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [官方 emissive bloom 示例](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_postprocessing_bloom_emissive.html)

## 验证与限制

- npm test：72 passed、0 failed。npm run build：通过。
- 实际浏览器已显示 WebGPU 与强制 WebGL 2 后端；两艘带贴图模型加载成功。
- 已操作三连齐射、近看转向、3 点修复至 20 生命、零血陨落；页面提示与演示状态符合预期。
- 最新布局与字体证据：docs/qa/visual-sample-layout.json、visual-sample-1440.png、visual-sample-1920.png、visual-sample-1280.png。
- 未做持续 GPU 性能基准、音频主观混音验收、OS 减少动态设置切换、完整模型导入兼容矩阵或故障恢复压力测试。
- 没有公网部署、Git 提交/推送或真人对战实现。原工作区未提交的玩法变更继续保留。

## 2026-09-27 字号与玻璃修订

依据用户提供的 06_55_38 样图调整字阶。01/区域等分类文字和规则同字号：1920×1080 为18px，1774×887 为16px，1280×720 为14px。标题、进度、导航与辅助文字使用统一响应式字阶；保留三处等尺寸卡牌。左右面板分别旋转 ±8°，深蓝底板不透明度17%，底部操作台20%，轻微背景模糊2px。电弧按 CSS 透视投影后的实际边缘绘制。窄屏关闭侧板透视。

修复放大文字后左侧末项压住汇总，以及参考图宽高比下校准按钮与操作台重叠；采用内部紧凑间距和可伸缩星链行布局。实测1280×720、1774×887、1920×1080；选5、三连射18→15、重置18通过。72项测试通过，最后的CSS间距修正已浏览器复查，最终构建通过。最新截图 visual-sample-readable-glass-reference.jpg 和 visual-sample-readable-glass-1280.jpg。

清晰度诊断：已接入的两份 GLB 各有4096×4096颜色纹理，但它是覆盖整艘船的UV图集，部分细节自身偏软。两者约1.06–1.09万三角形，具有顶点法线，但没有法线、粗糙度、金属度纹理。当前代码为全舰统一设置 roughness .45、metalness .28，且未提高纹理 anisotropy。原诊断窗口 DPR1.5 与渲染上限一致，不能将该窗口模糊归因于分辨率降采样。已有选择性发光 bloom。此轮未修改舰船材质/贴图，也未接入新增全舰队。
