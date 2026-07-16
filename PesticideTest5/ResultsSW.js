const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbw-nQVczGZguo7o0kZBBGil7Fb0m7dHEDLT-dy0tOEtNtBp_0pqLQSCJmExP0yeMTr_/exec";

(async function uploadPending() {
    const raw = localStorage.getItem("pendingUpload");
    if (!raw) return;
    localStorage.removeItem("pendingUpload");
    try {
        const data = JSON.parse(raw);
        await fetch(GOOGLE_SHEET_URL + "?t=" + Date.now(), {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(data)
        });
    } catch (err) {
        console.error("上傳失敗:", err);
    }
})();

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function judgeStatus(percent) {
    if (percent <= 35) return { color: 'green', label: '合格' };
    if (percent <= 45) return { color: 'orange', label: '有點危險' };
    return { color: 'red', label: '不合格' };
}

function renderCard(container, resultItem, index) {
    const card = document.createElement('div');
    card.className = 'box';
    card.innerHTML = `
        <div class="circle-wrapper">
            <svg viewBox="0 0 ${RADIUS * 2 + 14} ${RADIUS * 2 + 14}">
                <circle class="bg" cx="${RADIUS + 7}" cy="${RADIUS + 7}" r="${RADIUS}" />
                <circle class="fg" id="fgCircle_${index}" cx="${RADIUS + 7}" cy="${RADIUS + 7}" r="${RADIUS}" />
            </svg>
            <div class="percent-text" id="percentText_${index}">0%</div>
        </div>
        <div class="info">
            <div class="title">${resultItem.label}</div>
            <div class="status" id="statusText_${index}">--</div>
        </div>
    `;
    container.appendChild(card);
}

function animateCircle(index, percent, color) {
    const circle = document.getElementById(`fgCircle_${index}`);
    const text = document.getElementById(`percentText_${index}`);

    circle.style.strokeDasharray = CIRCUMFERENCE;
    circle.style.strokeDashoffset = CIRCUMFERENCE;
    circle.style.stroke = color;

    let current = 0;
    const duration = 1000;
    const steps = 60;
    const stepTime = duration / steps;
    const stepSize = percent / steps;

    const interval = setInterval(() => {
        current += stepSize;
        if (current >= percent) {
            current = percent;
            clearInterval(interval);
        }
        const offset = CIRCUMFERENCE - (current / 100) * CIRCUMFERENCE;
        circle.style.strokeDashoffset = offset;
        text.textContent = current.toFixed(2) + '%';
    }, stepTime);
}

const container = document.getElementById('resultsContainer');
const rawResults = localStorage.getItem("results");

let results = null;
try {
    results = JSON.parse(rawResults);
} catch (e) {
    results = null;
}

if (!results || !Array.isArray(results) || results.length === 0) {
    container.innerHTML = `
        <div class="box" style="justify-content:center;">
            <div class="status" style="color:#999; margin:0;">未接收到資料</div>
        </div>
    `;
} else {
    localStorage.removeItem("results");

    // 先把每張卡片畫出來，再逐一跑動畫（避免 DOM 還沒建立就抓不到元素）
    results.forEach((item, index) => renderCard(container, item, index));

    results.forEach((item, index) => {
        let percent = parseFloat(item.rate);
        const statusEl = document.getElementById(`statusText_${index}`);
        const percentEl = document.getElementById(`percentText_${index}`);
        const circleEl = document.getElementById(`fgCircle_${index}`);

        if (isNaN(percent)) {
            percentEl.textContent = '無資料';
            circleEl.style.stroke = '#ccc';
            statusEl.textContent = '未接收到資料';
            statusEl.style.color = '#999';
            return;
        }

        if (percent < -10 || percent > 100) {
            percentEl.textContent = '檢測率異常';
            circleEl.style.stroke = '#ccc';
            statusEl.textContent = '請檢查數據';
            statusEl.style.color = '#999';
            return;
        }

        if (percent < 0 && percent >= -10) percent = 0;

        const { color, label } = judgeStatus(percent);
        statusEl.textContent = label;
        statusEl.style.color = color;

        if (item.errorCode && item.errorCode !== "正常") {
            const errDiv = document.createElement('div');
            errDiv.className = 'errorNote';
            errDiv.textContent = item.errorCode;
            statusEl.insertAdjacentElement('afterend', errDiv);
        }

        animateCircle(index, percent, color);
    });
}
