// <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/PLYLoader.js"></script>

// 场景、相机、渲染器、控制器
let scene, camera, renderer, controls;
// 网格, 坐标轴
let grid, axes;
// 网格分段数量
let gridDivisions = 50;

// 点云对象
let currentPointCloud = null;
// 原始点云, 没有进行中心化和偏移
let currentPoints = [];

// 页面中的 viewer元素
let viewerElement

// 背景颜色
let backgroundColor = '#ffffff'
// 点大小
let pointSize = 1
// 点云颜色模式
let colorMode = 'uniform'
// 统一颜色
let uniColor = '#000000'
// 相机偏移比例
let cameraOffsetScale = 1

// 动画
let isAnimating = false;
// 动画速度
let animateSpeed = 0.01

// 初始化场景
function init() {
    // 创建场景
    scene = new THREE.Scene();
    // 设置背景颜色
    scene.background = new THREE.Color(backgroundColor);

    // 创建透视相机
    // 参数: 视野->60度，宽高比自适应，近平面->0.01，远平面->1000000
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    // 设置初始位置
    camera.position.set(10, 10, 10);
    // 设置 z轴向上
    camera.up.set(0, 0, 1);

    // 创建 WebGL渲染器
    // 开启抗锯齿, 保留绘图缓冲(以便导出截图)
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true
    });
    // 设置渲染器尺寸
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 匹配设备像素比
    renderer.setPixelRatio(window.devicePixelRatio);
    // 渲染器的 canvas 元素添加到 viewerElement 中
    viewerElement.appendChild(renderer.domElement);

    // 创建轨道控制器
    controls = new THREE.OrbitControls(
        camera,
        renderer.domElement
    );
    // 启用惯性效果(阻尼), 阻尼系数 0.05
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    // 设置z轴向上
    controls.object.up.set(0, 0, 1);

    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    controls.update();
    // 设置旋转方向
    controls.rotateSpeed = -1;

    // 添加辅助
    addHelpers();

    // 开始渲染循环
    animate();
}

// 添加辅助元素
function addHelpers() {
    // 添加网格辅助线, 大小->200, 分割->50段, 主色深灰, 辅色暗灰
    grid = new THREE.GridHelper(20, gridDivisions, '#646464', '#646464');
    // 让网格从 XZ → XY
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    // 添加坐标轴辅助, 长度->20, 红色 X 轴, 绿色 Y 轴, 蓝色 Z 轴
    axes = new THREE.AxesHelper(3);
    scene.add(axes);

    // // 添加环境光, 点云模式下光照无效, 为网格模式预留
    // // 颜色深灰, 强度 0.6, 均匀照亮物体
    // const ambientLight = new THREE.AmbientLight(0x404040, 0.7);
    // scene.add(ambientLight);

    // // 添加方向光, 点云模式下光照无效, 为网格模式预留
    // // 颜色白色，强度0.8, 位置 (10,10,5)
    // const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    // directionalLight.position.set(10, 10, 5);
    // scene.add(directionalLight);
}

// 根据 bbox 更新 grid 和 axes
function updateGridAndAxes() {
    const bbox = currentPointCloud.geometry.boundingBox;
    const size = bbox.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z)
    const gridSize = maxSize * 5
    const axesLength = maxSize * 0.8

    console.log(`bbox max size: ${maxSize}, grid size: ${gridSize}, axes length: ${axesLength}`)

    if (grid) {
        scene.remove(grid);
        grid.geometry.dispose();
        grid.material.dispose();
    }
    grid = new THREE.GridHelper(gridSize, gridDivisions, '#646464', '#646464');
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    if (axes) {
        scene.remove(axes);
        axes.geometry.dispose();
        axes.material.dispose();
    }
    axes = new THREE.AxesHelper(axesLength);
    scene.add(axes);
}

// 处理文件选择
async function handleFileSelect(event) {
    // 选取第一个文件
    const file = event.target.files[0];
    if (!file) return;

    await handleFile(file);
}

async function handleFile(file) {
    // 获取文件后缀
    const ext = file.name.split(".").pop().toLowerCase();
    console.log(`file: ${file.name}, suffix: ${ext}`);

    try {
        let geometry, points;
        switch (ext) {
            case "ply":
                // loadPlyFile(file).then(({geometry, points}) => {
                //     currentPoints = points
                //     createPcd(geometry)
                // });
                ({geometry, points} = await loadPlyFile(file));
                break;
            case "txt":
                ({geometry, points} = await loadTxtFile(file));
                break;
            default:
                throw new Error(`wrong point cloud input file type: ${file.name}`);
        }
        // 调试信息
        console.debug("original points: ", points);
        console.debug("geometry: ", geometry);
        console.log('pcd has color: ', geometry.hasAttribute('color')); // points[0].r !== undefined
        console.log('pcd points number: ', geometry.attributes.position.count);
        // 更新全局变量
        currentPoints = points;

        // 计算 包围盒bbox
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const bboxSize = bbox.getSize(new THREE.Vector3());
        const bboxCenter = bbox.getCenter(new THREE.Vector3());
        console.log('pcd bbox size: ', bboxSize, ', center: ', bboxCenter)
        // 获取包围球
        const sphere = bbox.getBoundingSphere(new THREE.Sphere());
        const sphereCenter = sphere.center;
        const sphereRadius = sphere.radius;
        console.log('pcd bbox sphere center: ', sphereCenter, ', radius: ', sphereRadius)

        // 计算 geometry的法向量
        geometry.computeVertexNormals();

        // 创建pcd
        createPcd(geometry);
        console.debug("PointCloud: ", currentPointCloud);

    } catch (e) {
        console.error("handle file failed:", e);
    }
}

// 加载 ply文件
function loadPlyFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const arrayBuffer = e.target.result;
                // 从ply中创建geometry
                let geometry = createGeometryFromPly(arrayBuffer);
                // 从geometry中创建points列表
                const points = creatPointsFromGeometry(geometry);
                resolve({geometry, points});
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// 从ply中创建geometry
function createGeometryFromPly(arrayBuffer) {
    const loader = new THREE.PLYLoader();
    const geometry = loader.parse(arrayBuffer);
    return geometry
}

// 从geometry中创建points列表
function creatPointsFromGeometry(geometry) {
    // 获取 position 数组
    const pos = geometry.attributes.position;
    const parr = pos.array;
    // 获取 color 数组
    const col = geometry.attributes.color;
    const carr = col ? col.array : null;
    // 定义 points列表
    const points = [];
    // 遍历
    for (let i = 0; i < pos.count; i++) {
        const point = {
            x: parr[i * 3],
            y: parr[i * 3 + 1],
            z: parr[i * 3 + 2]
        };
        if (carr) {
            point.r = carr[i * 3];
            point.g = carr[i * 3 + 1];
            point.b = carr[i * 3 + 2];
        }
        points.push(point);
    }
    return points;
}

// 加载 txt文件
function loadTxtFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const content = e.target.result;
                // 从txt中创建points列表
                const points = createPointsFromTxt(content);
                if (!points || points.length === 0) {
                    return reject(new Error("cannot parse txt file to point cloud"));
                }
                // 从points列表创建geometry
                let geometry = createGeometryFromPoints(points);
                resolve({geometry, points});
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// 从txt中创建points列表
function createPointsFromTxt(content) {
    // 按行分割
    const lines = content.trim().split(/\r?\n/);
    const points = [];
    // 循环每行
    for (let line of lines) {
        line = line.trim();
        // 跳过空行和注释
        if (!line || line.startsWith('#')) continue;
        // 每行按 , or space 进行分割
        const parts = line.split(/\s+|,|;/).filter(Boolean);
        // 提取数字
        let nums = parts.map(Number).filter(v => !isNaN(v));
        // 保留 至少有3个数字行
        if (nums.length >= 3) {
            // 提取 点 坐标xyz
            let point = {x: nums[0], y: nums[1], z: nums[2]};
            // 如果 有6个数字, 后三个为R G B
            if (nums.length >= 6) {
                // 提取 点 rgb值
                let r = nums[3];
                let g = nums[4];
                let b = nums[5];
                // 支持0-255或0-1的rgb
                // 归一化
                if (r > 1 || g > 1 || b > 1) {
                    r /= 255;
                    g /= 255;
                    b /= 255;
                }
                point.r = r;
                point.g = g;
                point.b = b;
            }
            points.push(point);
        }
    }
    return points
}

// 从points列表创建geometry
function createGeometryFromPoints(points) {
    // 创建 BufferGeometry
    const geometry = new THREE.BufferGeometry();
    // 创建数组 存储位置
    const positions = new Float32Array(points.length * 3);
    // 创建数组 存储颜色
    const colors = new Float32Array(points.length * 3);

    // 判断 point 是否有 RGB属性
    let hasColorAttribute = points[0] && typeof points[0].r === 'number';

    // 遍历每个point, 赋值 positions 和 colors
    points.forEach((point, i) => {
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
        if (hasColorAttribute) {
            colors[i * 3] = point.r;
            colors[i * 3 + 1] = point.g;
            colors[i * 3 + 2] = point.b;
        }
    });
    // geometry 设置 位置属性
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // geometry 设置 颜色属性
    if (hasColorAttribute) {
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    return geometry
}

// 创建点云
function createPcd(geometry) {
    // 移除旧的点云
    removeOldPcd()
    // 更新点云颜色
    updatePointColors(geometry);

    // 预估 point size
    const estimatedPointSize = estimatePointSize(geometry)
    pointSize = estimatedPointSize.estimated
    console.log('estimated point size: ', pointSize)

    // 创建 PointsMaterial
    const material = new THREE.PointsMaterial({
        size: pointSize,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
    });
    // 生成 Points 对象
    currentPointCloud = new THREE.Points(geometry, material);
    // 添加 Points 到场景
    scene.add(currentPointCloud);
    // 更新 Grid Axes
    updateGridAndAxes()
    // 调整相机位置
    adjustCamera();
}

// 移除旧点云数据
function removeOldPcd() {
    if (currentPointCloud) {
        scene.remove(currentPointCloud);
        currentPointCloud.geometry.dispose();
        currentPointCloud.material.dispose();
        currentPointCloud = null;
    }
}

// 更新点云颜色
function updatePointColors(geometry) {
    // 创建数组 存储颜色
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    // 获取 bbox
    const bbox = geometry.boundingBox;
    // 遍历 points, 设置颜色
    currentPoints.forEach((point, i) => {
        let color = new THREE.Color();
        // 根据 colorMode 进行点云着色
        switch (colorMode) {
            // 按point的高度(Z坐标值)进行颜色渐变着色
            case 'height':
                const heightRatio = (point.z - bbox.min.z) / (bbox.max.z - bbox.min.z);
                color.setHSL(0.7 * (1 - heightRatio), 1, 0.5);
                break;
            // 按point的对坐标原点的距离进行颜色渐变着色
            case 'centerDistance':
                const centerDistance = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
                const maxCenterDistance = Math.sqrt(bbox.max.x * bbox.max.x + bbox.max.y * bbox.max.y + bbox.max.z * bbox.max.z);
                const centerDistanceRatio = centerDistance / maxCenterDistance;
                color.setHSL(0.7 * (1 - centerDistanceRatio), 1, 0.5);
                break;
            // 按point的坐标值进行颜色渐变着色
            case 'coordinate':
                const coordinateDistance = Math.sqrt(
                    (point.x - bbox.min.x) * (point.x - bbox.min.x) +
                    (point.y - bbox.min.y) * (point.y - bbox.min.y) +
                    (point.z - bbox.min.z) * (point.z - bbox.min.z)
                );
                const maxCoordinateDistance = Math.sqrt(
                    (bbox.max.x - bbox.min.x) * (bbox.max.x - bbox.min.x) +
                    (bbox.max.y - bbox.min.y) * (bbox.max.y - bbox.min.y) +
                    (bbox.max.z - bbox.min.z) * (bbox.max.z - bbox.min.z)
                );
                const coordinateDistanceRatio = coordinateDistance / maxCoordinateDistance;
                color.setHSL(0.7 * (1 - coordinateDistanceRatio), 1, 0.5);
                break;
            // 统一着色
            case 'uniform':
                color.set(uniColor);
                break;
            // 原始RGB
            case 'originalRGB':
                if (point.r !== undefined) {
                    color.setRGB(point.r, point.g, point.b)
                } else {
                    color.set(uniColor);
                }
                break;
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    });
    // geometry 设置 颜色属性
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// 调整相机位置
function adjustCamera() {
    // 获取 bbox
    const bbox = currentPointCloud.geometry.boundingBox;
    // 获取包围球
    const sphere = bbox.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = sphere.radius;
    if (!Number.isFinite(radius) || radius === 0) return;

    // FOV 转弧度
    const fov = camera.fov * Math.PI / 180;
    // 计算距离
    let distance = radius / Math.sin(fov / 2);
    // 距离偏置
    distance *= cameraOffsetScale;
    console.log('camera fov: ', fov, 'distance: ', distance / cameraOffsetScale, 'distance with ratio: ', distance);

    // 相机方向（等距观察）
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    // 设置相机位置
    camera.position.copy(center).addScaledVector(dir, distance);
    // camera.near = distance / 100;
    // camera.far = distance * 100;
    // 更新投影矩阵
    camera.updateProjectionMatrix();
    // 让相机看向中心
    camera.lookAt(center);
    controls.target.copy(center);
    // 更新控制器目标
    controls.update();
}

// 重置相机位置
function resetCamera() {
    if (currentPointCloud) {
        // 复位z旋转坐标
        currentPointCloud.rotation.z = 0;
        adjustCamera();
    }
}

// 更新点大小
function updatePointSize(size) {
    pointSize = size
    if (currentPointCloud && currentPointCloud.material.size !== pointSize) {
        currentPointCloud.material.size = pointSize;
    }
}

// point size 预估
function estimatePointSize(geometry) {
    // 获取 bbox
    const bbox = geometry.boundingBox;
    // 尺寸
    const size = bbox.getSize(new THREE.Vector3());
    // 体积
    const volume = size.x * size.y * size.z;
    // 密度
    const density = geometry.attributes.position.count / volume;
    // 估算空间
    const spacing = Math.pow(1 / density, 1 / 3);

    const minPointSize = spacing * 0.004
    const maxPointSize = spacing * 0.4
    const estimatedPointSize = spacing * 0.04

    return {
        estimated: estimatedPointSize,
        min: minPointSize,
        max: maxPointSize,
        step: (maxPointSize - minPointSize) / 100,
    };
}

// 更新颜色模式
function updateColorMode(mode) {
    colorMode = mode
    if (currentPointCloud) {
        updatePointColors(currentPointCloud.geometry);
    }
}

// 更新统一颜色
function updateUniformColor(color) {
    uniColor = color
    if (currentPointCloud) {
        updatePointColors(currentPointCloud.geometry);
    }
}

// 窗口大小改变
function onWindowResize() {
    // 更新相机宽高比
    camera.aspect = window.innerWidth / window.innerHeight;
    // 更新投影矩阵
    camera.updateProjectionMatrix();
    // 调整渲染器尺寸
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 切换动画
function toggleAnimation() {
    isAnimating = !isAnimating;
}

// 动画循环
function animate() {
    // 请求下一帧
    requestAnimationFrame(animate);
    // 绕 Y 轴旋转 0.01 弧度
    if (isAnimating && currentPointCloud) {
        currentPointCloud.rotation.z += animateSpeed;
    }
    // 更新控制器
    controls.update();
    // 渲染场景
    renderer.render(scene, camera);
}

// 切换全屏
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

// 导出图片
function exportImage() {
    const link = document.createElement('a');
    link.download = 'pcd.png';
    link.href = renderer.domElement.toDataURL();
    link.click();
}

// 计算点云边界框
function calculateBboxFromPoints(points) {
    const bbox = {
        min: {x: Infinity, y: Infinity, z: Infinity},
        max: {x: -Infinity, y: -Infinity, z: -Infinity}
    };
    points.forEach(point => {
        bbox.min.x = Math.min(bbox.min.x, point.x);
        bbox.min.y = Math.min(bbox.min.y, point.y);
        bbox.min.z = Math.min(bbox.min.z, point.z);
        bbox.max.x = Math.max(bbox.max.x, point.x);
        bbox.max.y = Math.max(bbox.max.y, point.y);
        bbox.max.z = Math.max(bbox.max.z, point.z);
    });
    return bbox;
}

// function geometryTransfer(geometry) {
//     // 将geometry平移
//     geometry.translate(
//         -center.x,
//         -center.y,
//         -center.z
//     );
//     // 将geometry旋转
//     const mat = new THREE.Matrix4();
//     mat.makeRotationX(-Math.PI / 2);
//     geometry.applyMatrix4(mat);
// }
