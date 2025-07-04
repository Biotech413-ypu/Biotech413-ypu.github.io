// 水質檢測系統 - 整合版 main.js
// 支援 pH 、溶氧量、濁度檢測 參數line pH 105, Do 200, Turbidity 238

const video = document.getElementById('camera');
const redBox1 = document.getElementById('redBox1');
const boxLabel = document.getElementById('boxLabel');
const analyzeBtn = document.getElementById('analyzeBtn');
const result = document.getElementById('result');

// 按鈕元素
const btnPH = document.getElementById('btnPH');
const btnOxygen = document.getElementById('btnOxygen');
const btnTurbidity = document.getElementById('btnTurbidity');

// 當前選擇的檢測模式
let currentMode = '';

// ========== 共用功能 ==========
function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            video.srcObject = stream;
            video.play();
        })
        .catch(err => {
            result.innerHTML = `無法啟動攝影機：${err.message}`;
        });
}

function makeDraggable(box) {
    let isDragging = false, offsetX = 0, offsetY = 0;

    box.addEventListener('mousedown', startDrag);
    box.addEventListener('touchstart', startDrag);

    function startDrag(e) {
        isDragging = true;
        const evt = e.touches ? e.touches[0] : e;
        offsetX = evt.clientX - box.offsetLeft;
        offsetY = evt.clientY - box.offsetTop;
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', doDrag);
        document.addEventListener('touchend', stopDrag);
    }

    function doDrag(e) {
        if (!isDragging) return;
        const evt = e.touches ? e.touches[0] : e;
        box.style.left = `${evt.clientX - offsetX}px`;
        box.style.top = `${evt.clientY - offsetY}px`;
    }

    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', doDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', doDrag);
        document.removeEventListener('touchend', stopDrag);
    }
}

function getMedianColor(box) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const rect = box.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const x = (rect.left - videoRect.left) / videoRect.width * video.videoWidth;
    const y = (rect.top - videoRect.top) / videoRect.height * video.videoHeight;
    const w = rect.width / videoRect.width * video.videoWidth;
    const h = rect.height / videoRect.height * video.videoHeight;

    const imageData = ctx.getImageData(x, y, w, h).data;
    let rArr = [], gArr = [], bArr = [];

    for (let i = 0; i < imageData.length; i += 4) {
        rArr.push(imageData[i]);
        gArr.push(imageData[i + 1]);
        bArr.push(imageData[i + 2]);
    }

    const median = arr => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] || 0;
    return { r: median(rArr), g: median(gArr), b: median(bArr) };
}

function quadraticFit3Points(data) {
    const [p1, p2, p3] = data;
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;

    const denom = (x1 - x2) * (x1 - x3) * (x2 - x3);
    const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / denom;
    const b = (x3 ** 2 * (y1 - y2) + x2 ** 2 * (y3 - y1) + x1 ** 2 * (y2 - y3)) / denom;
    const c = (x2 * x3 * (x2 - x3) * y1 + x3 * x1 * (x3 - x1) * y2 + x1 * x2 * (x1 - x2) * y3) / denom;

    return [a, b, c];
}

// ========== pH 檢測 ==========
const phColorTable = [
    { ph: 3.8, color: [200, 60, 60] }, 
    { ph: 4,  color: [200, 80, 60] },
    { ph: 5,  color: [200, 120, 80] },
    { ph: 6,  color: [180, 180, 30] },
    { ph: 7,  color: [130, 150, 89] },
    { ph: 8,  color: [90, 150, 90] },
    { ph: 9,  color: [90, 90, 170] },
    { ph: 10, color: [150, 10, 130] },
    { ph: 10.2, color: [155, 30, 150] } 
];

let currentT = undefined;

function getNormalizedRGB(r, g, b) {
    const sum = r + g + b;
    return sum === 0 ? [0, 0, 0] : [r / sum, g / sum, b / sum];
}

function euclideanDist(v1, v2) {
    return Math.sqrt(
        (v1[0] - v2[0]) ** 2 +
        (v1[1] - v2[1]) ** 2 +
        (v1[2] - v2[2]) ** 2
    );
}

function getInterpolatedPhValue(r, g, b) {
    const target = getNormalizedRGB(r, g, b);
    const normTable = phColorTable.map(p => ({
        ph: p.ph,
        vec: getNormalizedRGB(...p.color)
    }));

    let minIdx = 0;
    let minDist = Infinity;
    normTable.forEach((entry, i) => {
        const d = euclideanDist(entry.vec, target);
        if (d < minDist) {
            minDist = d;
            minIdx = i;
        }
    });

    const p1 = normTable[minIdx];
    const neighbors = [];
    if (minIdx > 0) neighbors.push(normTable[minIdx - 1]);
    if (minIdx < normTable.length - 1) neighbors.push(normTable[minIdx + 1]);

    // 選最近的鄰近點
    let minNeighbor = neighbors[0];
    let minNeighborDist = euclideanDist(neighbors[0].vec, target);
    if (neighbors.length === 2) {
        const dist1 = minNeighborDist;
        const dist2 = euclideanDist(neighbors[1].vec, target);
        if (dist2 < dist1) {
            minNeighbor = neighbors[1];
            minNeighborDist = dist2;
        }
    }

    const d1 = euclideanDist(p1.vec, target);
    const d2 = minNeighborDist;
    const total = d1 + d2;
    let t = total === 0 ? 0 : d1 / total;
    t = Math.max(0, Math.min(1, t));
    currentT = t;

    const ph = p1.ph + (minNeighbor.ph - p1.ph) * t;

    console.log("\n🔍 pH 鄰近內插:");
    console.log("輸入 normalized RGB:", target.map(v => v.toFixed(4)));
    console.log(`最接近: pH=${p1.ph}, 距離=${d1.toFixed(4)}`);
    console.log(`鄰近比對: pH=${minNeighbor.ph}, 距離=${d2.toFixed(4)}`);
    console.log(`t=${t.toFixed(4)} → pH=${ph.toFixed(4)}`);

    return Math.round(ph * 100) / 100;
}

function analyzePH() {
    const { r, g, b } = getMedianColor(redBox1);
    const ph = getInterpolatedPhValue(r, g, b);
    const tStr = currentT !== undefined ? currentT.toFixed(4) : "N/A";

    result.innerHTML = `
        <div>R: ${r.toFixed(1)} G: ${g.toFixed(1)} B: ${b.toFixed(1)}</div>
        <div style="margin-top:10px;">
            <b>分析結果 pH：</b>
            <span style="font-size:20px;color:#1976D2;">${ph.toFixed(2)}</span><br>
            
        </div>
    `;
}

// ========== 溶氧量檢測 ==========
const doReference = [
    { ppm: 0, color: [200, 200, 200] },
    { ppm: 4, color: [200, 150, 150] },
    { ppm: 8, color: [200, 100, 100] }
];

function predictDO(r, g, b, coefficients) {
    const x = (g + b) / r;
    const [a, b1, c] = coefficients;
    return a * x * x + b1 * x + c;
}

function analyzeDO() {
    const { r, g, b } = getMedianColor(redBox1);
    const x = (g + b) / r;

    const fittingData = doReference.map(ref => ({
        x: (ref.color[1] + ref.color[2]) / ref.color[0],
        y: ref.ppm
    }));

    const coef = quadraticFit3Points(fittingData);
    const predictedDO = predictDO(r, g, b, coef);

    console.log("擬合資料:", fittingData);
    console.log("係數 a, b, c:", coef.map(v => v.toFixed(6)));
    console.log(`預測 DO：${predictedDO.toFixed(2)} ppm （x = ${(x).toFixed(4)}）`);

    result.innerHTML = `
        <div>R: ${r} G: ${g} B: ${b}</div>
        <div>(G+B)/R = ${x.toFixed(4)}</div>
        <div style="margin-top:10px;">
            <b>溶氧量 DO：</b>
            <span style="font-size:20px;color:#1976D2;">${predictedDO.toFixed(2)} ppm</span>
        </div>
    `;
}

// ========== 濁度檢測 ==========
const turbidityReference = [
    { jtu: 0, value: 1.0},    // (Q3-Q1)/median 
    { jtu: 40, value: 0.5 },
    { jtu: 100, value: 0.0 }
];

function getRGBSumStats(box) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const rect = box.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const x = (rect.left - videoRect.left) / videoRect.width * video.videoWidth;
    const y = (rect.top - videoRect.top) / videoRect.height * video.videoHeight;
    const w = rect.width / videoRect.width * video.videoWidth;
    const h = rect.height / videoRect.height * video.videoHeight;

    const imageData = ctx.getImageData(x, y, w, h).data;
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) / 2;

    let rgbSum = [];

    for (let i = 0; i < imageData.length; i += 4) {
        const pixelIndex = i / 4;
        const px = pixelIndex % w;
        const py = Math.floor(pixelIndex / w);
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > radius * radius) continue; // only pixels in circle

        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        rgbSum.push(r + g + b);
    }

    rgbSum.sort((a, b) => a - b);
    const q1 = rgbSum[Math.floor(rgbSum.length * 0.25)] || 0;
    const q3 = rgbSum[Math.floor(rgbSum.length * 0.75)] || 0;
    const median = rgbSum[Math.floor(rgbSum.length / 2)] || 1;
    const iqrNorm = (q3 - q1) / (median || 1);

    return { q1, q3, median, iqrNorm };
}

function predictTurbidity(iqrNorm, coefficients) {
    const [a, b1, c] = coefficients;
    return a * iqrNorm * iqrNorm + b1 * iqrNorm + c;
}

function analyzeTurbidity() {
    const { q1, q3, median, iqrNorm: originalIQRNorm } = getRGBSumStats(redBox1);
    let iqrNorm = originalIQRNorm;
    
    // 限制最大值，避免拋物線反彈
    if (iqrNorm > turbidityReference[0].value) {
        iqrNorm = turbidityReference[0].value;
    }
    
    const fittingData = turbidityReference.map(ref => ({
        x: ref.value,
        y: ref.jtu
    }));

    const coef = quadraticFit3Points(fittingData);
    const predictedJTU = predictTurbidity(iqrNorm, coef);

    console.log("四分位數:", q1, median, q3);
    console.log("IQR/median:", iqrNorm);
    console.log("係數 a, b, c:", coef.map(v => v.toFixed(6)));

    result.innerHTML = `
        <div style="margin-top:10px;">
            <b>混濁度 (JTU)：</b>
            <span style="font-size:20px;color:#1976D2;">${predictedJTU.toFixed(2)} JTU</span>
        </div>
    `;
}

// ========== 事件監聽器 ==========
btnPH.addEventListener('click', () => {
    currentMode = 'pH';
    boxLabel.textContent = 'pH 檢測';
    
    // 重置按鈕樣式
    document.querySelectorAll('.row button').forEach(btn => {
        btn.style.backgroundColor = '';
        btn.style.color = '';
    });
    
    // 高亮選中的按鈕
    btnPH.style.backgroundColor = '#1976D2';
    btnPH.style.color = 'white';
    
    result.innerHTML = '';
    console.log('切換到 pH 檢測模式');
});

btnOxygen.addEventListener('click', () => {
    currentMode = 'DO';
    boxLabel.textContent = '溶氧量檢測';
    
    // 重置按鈕樣式
    document.querySelectorAll('.row button').forEach(btn => {
        btn.style.backgroundColor = '';
        btn.style.color = '';
    });
    
    // 高亮選中的按鈕
    btnOxygen.style.backgroundColor = '#1976D2';
    btnOxygen.style.color = 'white';
    
    result.innerHTML = '';
    console.log('切換到溶氧量檢測模式');
});

btnTurbidity.addEventListener('click', () => {
    currentMode = 'turbidity';
    boxLabel.textContent = '濁度檢測';
    
    // 重置按鈕樣式
    document.querySelectorAll('.row button').forEach(btn => {
        btn.style.backgroundColor = '';
        btn.style.color = '';
    });
    
    // 高亮選中的按鈕
    btnTurbidity.style.backgroundColor = '#1976D2';
    btnTurbidity.style.color = 'white';
    
    result.innerHTML = '';
    console.log('切換到濁度檢測模式');
});

analyzeBtn.addEventListener('click', () => {
    if (!currentMode) {
        result.innerHTML = '<div style="color: red;">請先選擇檢測項目！</div>';
        return;
    }
    
    switch (currentMode) {
        case 'pH':
            analyzePH();
            break;
        case 'DO':
            analyzeDO();
            break;
        case 'turbidity':
            analyzeTurbidity();
            break;
        default:
            result.innerHTML = '<div style="color: red;">未知的檢測模式！</div>';
    }
});

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    startCamera();
    makeDraggable(redBox1);  
});