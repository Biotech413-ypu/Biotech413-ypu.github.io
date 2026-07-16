const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzjxUWuiQVYlDZ3zdM4An7Rby29H9PYvnxtd8J-SEnEyD6SmKGCl1XYJNDg2UhSxHFG4A/exec";

async function uploadToGoogleSheets(data) {
    const url = GOOGLE_SHEET_URL + "?t=" + Date.now();
    try {
        await fetch(url, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(data)
            // 不加 Content-Type
        });
    } catch (err) {
        console.error("上傳失敗:", err);
    }
}

function getDeviceInfo() {
    const ua = navigator.userAgent;

    // iOS 裝置
    if (/iPhone/.test(ua)) {
        const match = ua.match(/OS (\d+[_\d]*)/);
        const ver = match ? match[1].replace(/_/g, '.') : '';
        return `iPhone iOS ${ver}`;
    }
    if (/iPad/.test(ua)) {
        const match = ua.match(/OS (\d+[_\d]*)/);
        const ver = match ? match[1].replace(/_/g, '.') : '';
        return `iPad iOS ${ver}`;
    }

    // Android 裝置
    if (/Android/.test(ua)) {
        const verMatch = ua.match(/Android ([\d.]+)/);
        const ver = verMatch ? verMatch[1] : '';

        // 抓品牌名稱
        const brandMatch = ua.match(/\b(Samsung|Xiaomi|OPPO|vivo|Huawei|Pixel|OnePlus|ASUS|Sony|LG|Motorola|Realme|Nokia|HTC)\b/i);
        const brand = brandMatch ? brandMatch[1] : 'Android裝置';

        return `${brand} Android ${ver}`;
    }

    // 電腦
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';

    return ua.substring(0, 60);
}

// ── 6 組偵測框設定：1 空白組 + 5 樣品組（對應新檢測盒 後排3孔+前排3孔） ──
const BOX_IDS = ['redBox1', 'redBox2', 'redBox3', 'redBox4', 'redBox5', 'redBox6'];
const BLANK_ID = 'redBox1';
const SAMPLE_IDS = ['redBox2', 'redBox3', 'redBox4', 'redBox5', 'redBox6'];
const BOX_LABELS = {
    redBox1: '空白組',
    redBox2: '樣品組1',
    redBox3: '樣品組2',
    redBox4: '樣品組3',
    redBox5: '樣品組4',
    redBox6: '樣品組5'
};

const video = document.getElementById('camera');
const analyzeBtn = document.getElementById('analyzeBtn');
const stopBtn = document.getElementById('stopBtn');
const result = document.getElementById('result');
const analyzingOverlay = document.getElementById('analyzingOverlay');

const boxEls = {};
BOX_IDS.forEach(id => { boxEls[id] = document.getElementById(id); });

let stream;
let interval;
let logRGBValues = [];

let redBoxPositions = {};
BOX_IDS.forEach(id => { redBoxPositions[id] = { left: 0, top: 0 }; });

async function startCamera() {
    video.setAttribute('playsinline', true);
    video.setAttribute('webkit-playsinline', true);

    try {
        const constraints = {
            video: { facingMode: 'environment' }
        };
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("瀏覽器不支持 getUserMedia");
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
        };
        analyzeBtn.disabled = false;
        stopBtn.disabled = true;
    } catch (err) {
        console.error("無法啟動攝像頭: ", err);
        result.innerHTML = `錯誤：無法啟動攝像頭。請檢查瀏覽器權限設置或設備支持性。${err.message}`;
        analyzeBtn.disabled = true;
    }
}

function makeDraggable(box) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    function startDragging(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

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

function getAverageColor(box) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const videoRect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    const boxLeft = redBoxPositions[box.id].left;
    const boxTop = redBoxPositions[box.id].top;
    const boxWidth = box.offsetWidth;
    const boxHeight = box.offsetHeight;

    const boxX = boxLeft * scaleX;
    const boxY = boxTop * scaleY;
    const boxW = boxWidth * scaleX;
    const boxH = boxHeight * scaleY;

    const safeX = Math.max(0, Math.min(boxX, canvas.width - boxW));
    const safeY = Math.max(0, Math.min(boxY, canvas.height - boxH));

    const imageData = ctx.getImageData(safeX, safeY, boxW, boxH).data;

    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
    }

    return { r: r / count, g: g / count, b: b / count };
}

// 一次取得 5 個框目前的顏色
function getAllColors() {
    const colors = {};
    BOX_IDS.forEach(id => { colors[id] = getAverageColor(boxEls[id]); });
    return colors;
}

// 把 5 個框的 RGB 整理成可讀文字（供畫面顯示）
function formatColorReport(colors) {
    return BOX_IDS.map(id => {
        const c = colors[id];
        return `${BOX_LABELS[id]} RGB: (${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
    }).join('<br>');
}

function mapColorsToFixed(colors) {
    const out = {};
    BOX_IDS.forEach(id => {
        out[id] = { r: colors[id].r.toFixed(3), g: colors[id].g.toFixed(3), b: colors[id].b.toFixed(3) };
    });
    return out;
}

function removeOutliers(values, count = 3) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.slice(count, sorted.length - count);
}

function calculateQuartiles(values) {
    values = values.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return { q1: "N/A", q2: "N/A" };

    const trimmed = removeOutliers(values, 3);
    if (trimmed.length === 0) return { q1: "N/A", q2: "N/A" };

    const median = arr => {
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    };

    const q2Raw = median(trimmed);
    const lowerHalf = trimmed.slice(0, Math.floor(trimmed.length / 2));
    const q1Raw = median(lowerHalf);

    return {
        q1: q1Raw.toFixed(5),
        q2: q2Raw.toFixed(5)
    };
}

analyzeBtn.addEventListener('click', async function () {
    updateRedBoxPositions();

    logRGBValues = [];
    let intervalCount = 180;

    stopBtn.disabled = false;
    analyzeBtn.disabled = true;

    analyzingOverlay.style.display = 'flex';

    const colors0 = getAllColors();
    logRGBValues.push({
        time: intervalCount,
        colors: mapColorsToFixed(colors0),
        slope: null
    });

    result.innerHTML = `剩餘時間: ${intervalCount} 秒<br>${formatColorReport(colors0)}`;

    intervalCount -= 2;

    interval = setInterval(() => {
        const colors = getAllColors();
        const prev = logRGBValues[logRGBValues.length - 1];

        const slope = {};
        BOX_IDS.forEach(id => {
            slope[id] = (parseFloat(prev.colors[id].b) - colors[id].b).toFixed(3);
        });

        logRGBValues.push({
            time: intervalCount,
            colors: mapColorsToFixed(colors),
            slope
        });

        result.innerHTML = `剩餘時間: ${intervalCount} 秒<br>${formatColorReport(colors)}`;

        intervalCount -= 2;

        if (intervalCount < 0) {
            clearInterval(interval);
            analyzeBtn.disabled = false;
            stopBtn.disabled = true;
            toggleTorch(false);
            analyzingOverlay.style.display = 'none';
            showResults();
        }
    }, 2000);
});

function toggleTorch(on) {
    try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
            track.applyConstraints({
                advanced: [{ torch: on }]
            });
        }
    } catch (err) {
        console.error("無法控制手電筒: ", err);
    }
}

startCamera();
BOX_IDS.forEach(id => makeDraggable(boxEls[id]));

//20250514
document.getElementById('startBtn').addEventListener('click', async () => {
    await startCamera();
    video.onloadeddata = () => {
        updateRedBoxPositions();
        const colors = getAllColors();

        // 逐一檢查每個樣品組的 B 值是否與空白組相符（>150 且相差 <=15）
        const blankB = colors[BLANK_ID].b;
        const checks = SAMPLE_IDS.map(id => {
            const b = colors[id].b;
            const ok = blankB > 150 && b > 150 && Math.abs(blankB - b) <= 15;
            return `${BOX_LABELS[id]}: ${ok ? '✅ 正常' : '⚠️ 請調整光源或位置'}`;
        }).join('<br>');

        result.innerHTML = `
            ${formatColorReport(colors)}<br><br>
            <b>校正檢查(B值需&gt;150且與空白組相差&le;15)</b><br>${checks}
        `;
    };
});
//20250514

function calculatePercentageReduction(blankStats, sampleStats, rgbRatio = 1) {
    function safePercent(qBlank, qSample) {
        const n1 = parseFloat(qBlank);
        const n2 = parseFloat(qSample);
        if (n1 === 0) return { value: null, warning: null };

        if (n1 < 0.05 || n2 < -0.02) return { value: null, warning: "警告:酵素活性不足" };

        if (n2 > n1) return { value: (1 - (n1 / n2) * rgbRatio) * 100, warning: "警告:空白組/樣品組管位置可能錯置" };

        return { value: (1 - (n2 / n1) * rgbRatio) * 100, warning: null };
    }

    const q1Result = safePercent(blankStats.q1, sampleStats.q1);
    const q2Result = safePercent(blankStats.q2, sampleStats.q2);

    // 警告優先取 Q2 的
    const warning = q2Result.warning || null;

    const avg = (q1Result.value != null && q2Result.value != null)
        ? ((q1Result.value + q2Result.value) / 2).toFixed(2) + "%"
        : "N/A";

    return {
        q1Percent: q1Result.value != null ? q1Result.value.toFixed(2) + "%" : "N/A",
        q2Percent: q2Result.value != null ? q2Result.value.toFixed(2) + "%" : "N/A",
        average:   avg,
        warning:   warning
    };
}

function updateRedBoxPositions() {
    const parentRect = video.getBoundingClientRect();

    BOX_IDS.forEach(id => {
        const box = boxEls[id];
        const rect = box.getBoundingClientRect();

        redBoxPositions[id] = {
            left: rect.left - parentRect.left,
            top: rect.top - parentRect.top
        };
    });
}

function movingAverage(values, windowSize = 5) {
    const result = [];
    for (let i = 0; i <= values.length - windowSize; i++) {
        const window = values.slice(i, i + windowSize);
        const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
        result.push(avg);
    }
    return result;
}

// 計算某個框在整段分析期間，原始 R/G/B 的 Q2 加總（用於燈光/角度校正比值）
function rgbQ2Sum(id) {
    const q2 = ch => parseFloat(calculateQuartiles(
        logRGBValues.map(e => parseFloat(e.colors[id][ch])).filter(v => !isNaN(v))
    ).q2);
    const rQ2 = q2('r'), gQ2 = q2('g'), bQ2 = q2('b');
    return { rQ2, gQ2, bQ2, sum: rQ2 + gQ2 + bQ2 };
}

// ── 計算 5 組樣品的結果並上傳 ──────────────────────────────────────
function showResults() {
    const validData = logRGBValues.filter(entry =>
        entry.slope && BOX_IDS.every(id => !isNaN(parseFloat(entry.slope[id])))
    );

    // 空白組的酵素反應斜率（B channel 下降速率）
    const blankSlopeRaw = validData.map(e => parseFloat(e.slope[BLANK_ID]));
    const blankSlopeSmoothed = movingAverage(blankSlopeRaw, 5);
    const blankStats = calculateQuartiles(blankSlopeSmoothed);

    const blankRGB = rgbQ2Sum(BLANK_ID);

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const sheetName = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const results = [];
    const summary = {
        nickname:     localStorage.getItem('nickname') || '未填寫',
        device:       getDeviceInfo(),
        time:         now.toLocaleString("zh-TW"),
        blankRQ2:     blankRGB.rQ2.toFixed(3),
        blankGQ2:     blankRGB.gQ2.toFixed(3),
        blankBQ2:     blankRGB.bQ2.toFixed(3),
        blankSum:     blankRGB.sum.toFixed(3),
        blankSlopeQ1: blankStats.q1,
        blankSlopeQ2: blankStats.q2
    };

    SAMPLE_IDS.forEach((id, idx) => {
        const n = idx + 1;

        const sampSlopeRaw = validData.map(e => parseFloat(e.slope[id]));
        const sampSlopeSmoothed = movingAverage(sampSlopeRaw, 5);
        const sampStats = calculateQuartiles(sampSlopeSmoothed);

        const sampRGB = rgbQ2Sum(id);
        const rgbRatio = (sampRGB.sum !== 0) ? blankRGB.sum / sampRGB.sum : 1;

        const percentReduction = calculatePercentageReduction(blankStats, sampStats, rgbRatio);
        const errorCode = percentReduction.warning || "正常";

        results.push({
            label:     BOX_LABELS[id],
            rate:      percentReduction.q2Percent,
            average:   percentReduction.average,
            errorCode: errorCode
        });

        summary[`sample${n}_label`]     = BOX_LABELS[id];
        summary[`sample${n}_rate`]      = percentReduction.q2Percent;
        summary[`sample${n}_average`]   = percentReduction.average;
        summary[`sample${n}_errorCode`] = errorCode;
        summary[`sample${n}_slopeQ1`]   = sampStats.q1;
        summary[`sample${n}_slopeQ2`]   = sampStats.q2;
        summary[`sample${n}_RQ2`]       = sampRGB.rQ2.toFixed(3);
        summary[`sample${n}_GQ2`]       = sampRGB.gQ2.toFixed(3);
        summary[`sample${n}_BQ2`]       = sampRGB.bQ2.toFixed(3);
        summary[`sample${n}_rgbRatio`]  = rgbRatio.toFixed(5);
    });

    // Results.html 用 "results"（陣列，5 筆）畫出 5 個圓形結果卡
    localStorage.setItem("results", JSON.stringify(results));

    // 上傳給 Google Sheets 的資料：summary 為單列彙總，rawData 為逐筆時間序列
    localStorage.setItem("pendingUpload", JSON.stringify({
        sheetName,
        summary,
        rawData: logRGBValues.map(entry => {
            const row = [entry.time];
            BOX_IDS.forEach(id => row.push(entry.colors[id].r, entry.colors[id].g, entry.colors[id].b));
            BOX_IDS.forEach(id => row.push(entry.slope ? entry.slope[id] : ""));
            return row;
        })
    }));

    location.href = "Results.html";
}
