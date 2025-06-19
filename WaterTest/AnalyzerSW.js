// 攝影機與紅框設定
const video = document.getElementById('camera');
const btnPH = document.getElementById('btnPH');
const btnOxygen = document.getElementById('btnOxygen');
const btnTurbidity = document.getElementById('btnTurbidity');
const analyzeBtn = document.getElementById('analyzeBtn');
const result = document.getElementById('result');
const redBox1 = document.getElementById('redBox1');
const boxLabel = document.getElementById('boxLabel');

const phColorTable = [

    { ph: 4,  color: [154, 70, 79] },
    { ph: 5,  color: [165, 81, 81] },
    { ph: 6,  color: [212, 210, 147] },
    { ph: 7,  color: [130, 150, 89] },
    { ph: 8,  color: [90, 142, 90] },
    { ph: 9,  color: [58, 60, 76] },
    { ph: 10, color: [115, 38, 66] },
];

const oxygenStd = [
    { boxId: "redBox2", concentration: 0 },   
    { boxId: "redBox3", concentration: 4 },   
    { boxId: "redBox4", concentration: 8 }   
];

const turbidityStd = [
    { boxId: "redBox2", turbidity: 0 },    // 0 JTU
    { boxId: "redBox3", turbidity: 40 },   // 40 JTU
    { boxId: "redBox4", turbidity: 100 }   // 100 JTU
];

let stream;
let interval;
let logRGBValues = [];

let redBoxPositions = {
    redBox1: { left: 0, top: 0 },
};

function getContrast(box) {
    // 取得主圈區域像素資料
    if (!video.videoWidth || !video.videoHeight) return 0;

    const videoRect = video.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    // 紅框在 video 內的相對座標
    const relLeft = (boxRect.left - videoRect.left) / videoRect.width;
    const relTop = (boxRect.top - videoRect.top) / videoRect.height;
    const relW = boxRect.width / videoRect.width;
    const relH = boxRect.height / videoRect.height;

    const x = Math.round(relLeft * video.videoWidth);
    const y = Math.round(relTop * video.videoHeight);
    const w = Math.round(relW * video.videoWidth);
    const h = Math.round(relH * video.videoHeight);

    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > video.videoWidth || y + h > video.videoHeight)
        return 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(x, y, w, h).data;
    const LArr = [];

    for (let i = 0; i < imageData.length; i += 4) {
        // RGB to grayscale luminance (ITU-R BT.709)
        let r = imageData[i], g = imageData[i+1], b = imageData[i+2];
        let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        LArr.push(L);
    }
    // 亮度排序
    LArr.sort((a, b) => a - b);
    let n = LArr.length;
    if (n === 0) return 0;

    // 最暗10%、最亮10%
    let percent = 0.1;
    let nPart = Math.max(1, Math.floor(n * percent));

    let black = LArr.slice(0, nPart).reduce((s, v) => s + v, 0) / nPart;
    let white = LArr.slice(n - nPart, n).reduce((s, v) => s + v, 0) / nPart;

    // 避免0除
    if (black + white === 0) return 0;
    let contrast = (white - black) / (white + black);
    return contrast;
}

function getTurbidityCurveTable() {
    return turbidityStd.map(std => {
        let box = document.getElementById(std.boxId);
        if (!box) return null;
        let contrast = getContrast(box);
        return { contrast: contrast, turbidity: std.turbidity };
    });
}

function getTurbidityFromCurve(mainContrast, stdCurveTable) {
    // 確保資料按 JTU 對應正確排序（如果已確定無誤可省略）
    stdCurveTable = stdCurveTable.sort((a, b) => a.turbidity - b.turbidity);
    let x = stdCurveTable.map(e => e.contrast);    // 對比度
    let y = stdCurveTable.map(e => e.turbidity);   // JTU：0, 40, 100

    // 直接做二次曲線回歸
    let fit = quadraticFit(x, y);
    let turbidity = fit.a * mainContrast * mainContrast + fit.b * mainContrast + fit.c;
    return turbidity;
}




// 啟動攝影機功能
async function startCamera() {
    video.setAttribute('playsinline', true);
    video.setAttribute('webkit-playsinline', true);

    try {
        const constraints = {
            video: { facingMode: 'environment' }
        };

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("瀏覽器不支援 getUserMedia");
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => video.play();
        isCameraNotReady = false;
        analyzeBtn.disabled = false;

    } catch (err) {
        console.error("攝影機錯誤: ", err);
        result.innerHTML = `錯誤：無法啟動攝影機。${err.message}`;
        alert("請開啟攝像頭！")
        analyzeBtn.disabled = true;
    }
}

// 開啟相機
startCamera()

// 紅框拖曳功能
function makeDraggable(box) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    function startDragging(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const parentRect = box.offsetParent.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();

        offsetX = clientX - boxRect.left;
        offsetY = clientY - boxRect.top;

        e.preventDefault();
        e.stopPropagation();
        document.body.style.cursor = 'grabbing';
    }

    function moveDragging(e) {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const parent = box.offsetParent;
        const camera = document.getElementById('camera');
        const parentRect = parent.getBoundingClientRect();
        const cameraRect = camera.getBoundingClientRect();

        const cameraOffsetLeft = cameraRect.left - parentRect.left;
        const cameraOffsetTop = cameraRect.top - parentRect.top;

        const boxWidth = box.offsetWidth;
        const boxHeight = box.offsetHeight;

        const rawLeft = clientX - parentRect.left - offsetX;
        const rawTop = clientY - parentRect.top - offsetY;

        const minLeft = cameraOffsetLeft;
        const maxLeft = cameraOffsetLeft + camera.offsetWidth - boxWidth;
        const minTop = cameraOffsetTop;
        const maxTop = cameraOffsetTop + camera.offsetHeight - boxHeight;

        const newLeft = Math.max(minLeft, Math.min(rawLeft, maxLeft));
        const newTop = Math.max(minTop, Math.min(rawTop, maxTop));

        box.style.left = `${newLeft}px`;
        box.style.top = `${newTop}px`;

        redBoxPositions[box.id] = { left: newLeft, top: newTop };
    }

    function stopDragging() {
        isDragging = false;
        document.body.style.cursor = 'default';
    }

    box.addEventListener('mousedown', startDragging);
    box.addEventListener('touchstart', startDragging);
    document.addEventListener('mousemove', moveDragging);
    document.addEventListener('touchmove', moveDragging, { passive: false });
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('touchend', stopDragging);
}

// 計算紅框 RGB 值中位數
function getMedianColor(box) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const videoRect = video.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    const videoAspect = video.videoWidth / video.videoHeight;
    const rectAspect = videoRect.width / videoRect.height;

    let drawWidth, drawHeight, padLeft, padTop;

    if (videoAspect > rectAspect) {
        drawWidth = videoRect.width;
        drawHeight = videoRect.width / videoAspect;
        padLeft = 0;
        padTop = (videoRect.height - drawHeight) / 2;
    } else {
        drawHeight = videoRect.height;
        drawWidth = videoRect.height * videoAspect;
        padTop = 0;
        padLeft = (videoRect.width - drawWidth) / 2;
    }

    const boxLeftInVideo = boxRect.left - videoRect.left - padLeft;
    const boxTopInVideo = boxRect.top - videoRect.top - padTop;

    const scaleX = video.videoWidth / drawWidth;
    const scaleY = video.videoHeight / drawHeight;

    const imgX = boxLeftInVideo * scaleX;
    const imgY = boxTopInVideo * scaleY;
    const imgW = boxRect.width * scaleX;
    const imgH = boxRect.height * scaleY;

    const intX = Math.round(imgX);
    const intY = Math.round(imgY);
    const intW = Math.round(imgW);
    const intH = Math.round(imgH);

    if (intW <= 0 || intH <= 0) return { r: 0, g: 0, b: 0 };
    if (intX < 0 || intY < 0 || intX+intW > canvas.width || intY+intH > canvas.height) {
        return { r: 0, g: 0, b: 0 };
    }

    const imageData = ctx.getImageData(intX, intY, intW, intH).data;

    const rArr = [], gArr = [], bArr = [];
    const cx = intW / 2;
    const cy = intH / 2;
    const radius = Math.min(intW, intH) / 2;
    for (let y = 0; y < intH; y++) {
        for (let x = 0; x < intW; x++) {
            const dx = x - cx;
            const dy = y - cy;
            if (dx*dx + dy*dy > radius*radius) continue;
            const idx = (y * intW + x) * 4;
            rArr.push(imageData[idx]);
            gArr.push(imageData[idx + 1]);
            bArr.push(imageData[idx + 2]);
        }
    }
    // Helper: 中位數
    function median(arr) {
        if (arr.length === 0) return 0;
        arr.sort((a, b) => a - b);
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0 ? (arr[mid-1] + arr[mid]) / 2 : arr[mid];
    }
    return {
        r: median(rArr),
        g: median(gArr),
        b: median(bArr)
    };
}

// 取得標定紅圈的 Lab/B值/濃度
function getOxygenLabTable() {
    return oxygenStd.map(std => {
        const box = document.getElementById(std.boxId);
        if (!box) return null;
        const color = getMedianColor(box);

        return {
            lab: color.b / Math.max(color.r, 1),   // 用 B/R 當 lab
            concentration: std.concentration,
            b: color.b
        };
    });
}

// Delta-E 線性插值法
function getOxygenByLab(mainColor, stdLabTable, tolerance=0.005) {
     let mainBr = mainColor.b / Math.max(mainColor.r, 1);

    for (let i = 0; i < stdLabTable.length; i++) {
        let diff = Math.abs(mainBr - stdLabTable[i].lab);
        if (diff < tolerance) {
            return stdLabTable[i].concentration;
        }
    }

    let result = 0;
    let totalWeight = 0;
    for (let i = 0; i < stdLabTable.length; i++) {
        let diff = Math.abs(mainBr - stdLabTable[i].lab);
        let weight = 1 / Math.max(diff, 1e-6);
        result += stdLabTable[i].concentration * weight;
        totalWeight += weight;
    }

    return result / totalWeight;
}


//拖曳紅框
makeDraggable(redBox1);

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
if (isMobile) {
    document.body.style.overflow = 'hidden';
}

//按鈕功能
//pH
btnPH.addEventListener("click", function () {
        // 1. 改紅框邊框顏色
        redBox1.style.borderColor = '#1976D2';

        // 2. 改標籤文字
         boxLabel.textContent = "酸鹼值";

        //算式

});

//溶氧
btnOxygen.addEventListener("click", function () {
        // 1. 改紅框邊框顏色
        redBox1.style.borderColor = '#4CAF50';

        // 2. 改標籤文字
         boxLabel.textContent = "溶氧量";

        //算式
});

//濁度
btnTurbidity.addEventListener("click", function () {
        // 1. 改紅框邊框顏色
        redBox1.style.borderColor = '#EF6C00';

        // 2. 改標籤文字
         boxLabel.textContent = "濁度";

        //算式
});

function createFixedCircle(id, left, top) {
    if (document.getElementById(id)) return;
    const box = document.createElement('div');
    box.className = 'redBox fixed';
    box.id = id;
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.borderColor = '#FF1744'; // 紅色
    document.querySelector('.container').appendChild(box);
}
function removeFixedCircles() {
    for (let i = 2; i <= 4; i++) {
        const box = document.getElementById(`redBox${i}`);
        if (box) box.remove();
    }
}
btnPH.addEventListener("click", function () {
    redBox1.style.borderColor = '#1976D2';
    boxLabel.textContent = "酸鹼值";
    removeFixedCircles();
});
btnOxygen.addEventListener("click", function () {
    redBox1.style.borderColor = '#4CAF50';
    boxLabel.textContent = "溶氧量";
    removeFixedCircles();
    createFixedCircle('redBox2', 100, 25);
    createFixedCircle('redBox3', 100, 100);
    createFixedCircle('redBox4', 100, 175);
});
btnTurbidity.addEventListener("click", function () {
    redBox1.style.borderColor = '#EF6C00';
    boxLabel.textContent = "濁度";
    removeFixedCircles();
});

function rgb2xyz(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r+0.055)/1.055,2.4) : r/12.92;
    g = g > 0.04045 ? Math.pow((g+0.055)/1.055,2.4) : g/12.92;
    b = b > 0.04045 ? Math.pow((b+0.055)/1.055,2.4) : b/12.92;
    var x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    var y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    var z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    return [x*100, y*100, z*100];
}
function xyz2lab(x, y, z) {
    var refX = 95.047, refY = 100.000, refZ = 108.883;
    x /= refX; y /= refY; z /= refZ;
    x = x > 0.008856 ? Math.pow(x,1/3) : (7.787*x) + 16/116;
    y = y > 0.008856 ? Math.pow(y,1/3) : (7.787*y) + 16/116;
    z = z > 0.008856 ? Math.pow(z,1/3) : (7.787*z) + 16/116;
    var L = 116*y - 16;
    var a = 500*(x - y);
    var b = 200*(y - z);
    return [L, a, b];
}
function rgb2lab(r, g, b) {
    var xyz = rgb2xyz(r, g, b);
    return xyz2lab(xyz[0], xyz[1], xyz[2]);
}
function deltaE(lab1, lab2) {
    return Math.sqrt(
        Math.pow(lab1[0] - lab2[0], 2) +
        Math.pow(lab1[1] - lab2[1], 2) +
        Math.pow(lab1[2] - lab2[2], 2)
    );
}


function getInterpolatedPhValue(r, g, b) {
    const lab = rgb2lab(r, g, b);

    let minDist = Number.MAX_VALUE;
    let minIdx = 0;

    // 建議只計算一次並緩存
    const phLabTable = phColorTable.map(e => rgb2lab(e.color[0], e.color[1], e.color[2]));

    for (let i = 0; i < phColorTable.length; i++) {
        const refLab = phLabTable[i];
        const dist = deltaE(lab, refLab);
        if (dist < minDist) {
            minDist = dist;
            minIdx = i;
        }
    }

    let idx1 = minIdx, idx2;
    if (minIdx === 0) {
        idx2 = 1;
    } else if (minIdx === phColorTable.length - 1) {
        idx2 = minIdx - 1;
    } else {
        const distPrev = deltaE(lab, phLabTable[minIdx - 1]);
        const distNext = deltaE(lab, phLabTable[minIdx + 1]);
        idx2 = (distPrev < distNext) ? minIdx - 1 : minIdx + 1;
    }

    const p1 = phColorTable[idx1];
    const p2 = phColorTable[idx2];
    const lab1 = phLabTable[idx1];
    const lab2 = phLabTable[idx2];

    const v1 = [lab2[0] - lab1[0], lab2[1] - lab1[1], lab2[2] - lab1[2]];
    const v2 = [lab[0] - lab1[0], lab[1] - lab1[1], lab[2] - lab1[2]];
    const dot = v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2];
    const len2 = v1[0]*v1[0] + v1[1]*v1[1] + v1[2]*v1[2];
    let t = len2 === 0 ? 0 : dot / len2;
    t = Math.max(0, Math.min(1, t));

    let ph = p1.ph + (p2.ph - p1.ph) * t;
    ph = Math.max(phColorTable[0].ph, Math.min(phColorTable[phColorTable.length - 1].ph, ph));
    return Math.round(ph * 10) / 10;
}


function quadraticFit(x, y) {
    // x 與 y 均為三元素陣列
    // 建立三元一次聯立方程式
    const X = [
        [x[0]*x[0], x[0], 1],
        [x[1]*x[1], x[1], 1],
        [x[2]*x[2], x[2], 1]
    ];
    const Y = [y[0], y[1], y[2]];

    // 高斯消去法解 3x3 方程組
    function gaussian(A, b) {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            // 主元化
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
            }
            [A[i], A[maxRow]] = [A[maxRow], A[i]];
            [b[i], b[maxRow]] = [b[maxRow], b[i]];
            // 歸一化
            let div = A[i][i];
            for (let j = i; j < n; j++) A[i][j] /= div;
            b[i] /= div;
            // 消元
            for (let k = i + 1; k < n; k++) {
                let c = A[k][i];
                for (let j = i; j < n; j++) A[k][j] -= c * A[i][j];
                b[k] -= c * b[i];
            }
        }
        // 回代
        let x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = b[i];
            for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
        }
        return x;
    }
    const coeffs = gaussian(X, Y);
    return { a: coeffs[0], b: coeffs[1], c: coeffs[2] };
}


btnTurbidity.addEventListener("click", function () {
    redBox1.style.borderColor = '#EF6C00';
    boxLabel.textContent = "濁度";
    removeFixedCircles();
    createFixedCircle('redBox2', 100, 25);
    createFixedCircle('redBox3', 100, 100);
    createFixedCircle('redBox4', 100, 175);
});

analyzeBtn.addEventListener("click", function () {
    const labelText = boxLabel.textContent.trim();

    let circleIds = ["redBox1"];
    if (labelText === "溶氧量" || labelText === "濁度") {
        for (let i = 2; i <= 4; i++) {
            if (document.getElementById(`redBox${i}`)) {
                circleIds.push(`redBox${i}`);
            }
        }
    }

    let resultHtml = "";
    let mainColor = null;
    for (let i = 0; i < circleIds.length; i++) {
        const box = document.getElementById(circleIds[i]);
        if (!box) continue;
        const color = getMedianColor(box);
        let label = (i === 0) ? "主圈" : `紅圈${i + 1}`;
        resultHtml += `<div>

            R: ${color.r.toFixed(1)}　
            G: ${color.g.toFixed(1)}　
            B: ${color.b.toFixed(1)}
        </div>`;
        if (i === 0) mainColor = color;
    }

    // pH值
    if (labelText === "酸鹼值" && mainColor) {
        const ph = getInterpolatedPhValue(mainColor.r, mainColor.g, mainColor.b);
        resultHtml += `<div style="margin-top:8px;">
            <b>分析結果 pH：</b>
            <span style="font-size:20px;color:#1976D2;">${ph.toFixed(1)}</span>
        </div>`;
    }
    // 溶氧量 - Lab/Delta-E & B值雙方法
    else if (labelText === "溶氧量" && mainColor) {
    let stdLabTable = getOxygenLabTable();
    if (stdLabTable.some(e => e === null)) {
        resultHtml += `<div style="color:red">標定紅圈尚未完整顯示，請確認。</div>`;
    } else {
        // Lab/Delta-E法
        let conc_lab = getOxygenByLab(mainColor, stdLabTable);

        // B值二次回歸法
        let x = stdLabTable.map(e => e.b);
        let y = stdLabTable.map(e => e.concentration);
        let fit = quadraticFit(x, y);
        let conc_b = fit.a * mainColor.b * mainColor.b + fit.b * mainColor.b + fit.c;

        // 只顯示兩種方法各自的結果
        resultHtml += `<div style="margin-top:8px;">
            <b>主圈對應溶氧量：</b><br>
            <span style="font-size:18px;color:#1e88e5;">${conc_lab.toFixed(2)} ppm (Lab/Delta-E)</span><br>
            <span style="font-size:18px;color:#43a047;">${conc_b.toFixed(2)} ppm (B值曲線)</span>
        </div>`;
    }
}
    // 濁度
    else if (labelText === "濁度") {
    let stdCurveTable = getTurbidityCurveTable();
    if (stdCurveTable.some(e => e === null)) {
        resultHtml += `<div style="color:red">標定紅圈尚未完整顯示，請確認。</div>`;
    } else {
        let mainContrast = getContrast(redBox1);
        let turbidity = getTurbidityFromCurve(mainContrast, stdCurveTable);
        // 顯示三圈數值方便檢查
        stdCurveTable.forEach((e,i)=>{
            resultHtml += `<div>標定圈${i+1}對比度: ${e.contrast.toFixed(4)}，JTU=${e.turbidity}</div>`;
        });
        resultHtml += `<div style="margin-top:8px;">
            <b>主圈對應濁度：</b><br>
            <span style="font-size:18px;color:#EF6C00;">${turbidity.toFixed(2)} JTU (對比度曲線)</span>
            <br>主圈對比度: ${mainContrast.toFixed(4)}
        </div>`;
    }
}
    // 未選擇
    else if (labelText !== "酸鹼值" && labelText !== "溶氧量" && labelText !== "濁度") {
        alert("請選擇檢測項目！");
    }
result.innerHTML = resultHtml;
});

let isTorchOn = false;
let track = null;

const flashBtn = document.getElementById('flashToggleBtn');

flashBtn.addEventListener('click', async function () {
    if (!stream) {
        alert('攝影機尚未啟動！');
        return;
    }

    // 取得攝影機 track
    if (!track) {
        track = stream.getVideoTracks()[0];
    }
    const capabilities = track.getCapabilities();

    // 檢查是否支援手電筒
    if (!capabilities.torch) {
        alert('此裝置不支援手電筒');
        return;
    }

    try {
        isTorchOn = !isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        flashBtn.textContent = isTorchOn ? '關閉手電筒' : '開啟手電筒';
    } catch (e) {
        alert('手電筒操作失敗！');
        isTorchOn = false;
        flashBtn.textContent = '開啟手電筒';
    }
});
