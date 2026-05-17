# PointCloudWebViewer

* 参考自：https://github.com/qiuming77/PointScope
* 基于 Three.js 的纯前端点云可视化页面
* 支持 TXT(xyz or xyzrgb), PLY 文件
* 支持颜色映射、导出截图、全屏、旋转动画、自适应网格坐标轴、自适应缩放、自适应点大小
* 页面通过 CDN 引入 three.js、OrbitControls、PLYLoader（需要网络）

## 运行
- Python 
    `python -m http.server 5500`
  - 访问：http://localhost:5500/viewer.html
- Node.js
  - `npx http-server -p 5500`
  - 访问：http://localhost:5500/viewer.html

## 支持的文件格式
- TXT
  - 每行示例（空格、逗号或分号分隔均可）：
    ```
    0.1 0.2 0.3
    1.0, 2.0, 3.0, 255, 0, 128
    ```
  - 如果提供 r g b，范围可为 0-1 或 0-255（会自动归一化）
- PLY
  - 解析 position，若包含 color（r,g,b），将启用顶点颜色
  - 本项目中 PLY 采用 PLYLoader 直接构建 BufferGeometry 并启用相机自动包围
  - 