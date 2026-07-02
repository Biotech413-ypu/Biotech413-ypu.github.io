const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbzjxUWuiQVYlDZ3zdM4An7Rby29H9PYvnxtd8J-SEnEyD6SmKGCl1XYJNDg2UhSxHFG4A/exec";

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

const circle = document.getElementById('fgCircle');
const text = document.getElementById('percentText');
const status = document.getElementById('statusText');

const radius = 70;
const circumference = 2 * Math.PI * radius;

circle.style.strokeDasharray = circumference;
circle.style.strokeDashoffset = circumference;

const rateRaw = localStorage.getItem("rate");
let percent = parseFloat(rateRaw);

if (rateRaw === null) {
    // 沒有資料 → 不顯示動畫與數值，顯示錯誤提示
    document.getElementById("percentText").textContent = "無資料";
    document.getElementById("fgCircle").style.stroke = "#ccc";
    document.getElementById("statusText").textContent = "未接收到資料";
    document.getElementById("statusText").style.color = "#999";
} 
else if ( percent < -10 || percent > 100) {
    document.getElementById("percentText").textContent = "檢測率異常";
    document.getElementById("fgCircle").style.stroke = "#ccc";
    document.getElementById("statusText").textContent = "請檢查數據";
    document.getElementById("statusText").style.color = "#999";
    }
else 
{
    localStorage.removeItem("rate");
    
     if ( percent < 0 && percent >= -10 ) {
        percent = 0 ;
    }

    const circle = document.getElementById('fgCircle');
    const text = document.getElementById('percentText');
    const status = document.getElementById('statusText');

    const radius = 70;
    const circumference = 2 * Math.PI * radius;

    let color = '';
    if (percent <= 35) {
        color = 'green';
    } else if (percent <= 45) {
        color = 'orange';
    } else {
        color = 'red';
    }

    circle.style.strokeDasharray = circumference;
    circle.style.strokeDashoffset = circumference;
    circle.style.stroke = color;
    // 顯示錯誤碼
    const errorCode = localStorage.getItem("errorCode");
    if (errorCode && errorCode !== "正常") {
        const errorDiv = document.createElement('div');
        errorDiv.textContent = errorCode;
        errorDiv.style.cssText = `
            font-size: 14px;
            color: #e63946;
            font-weight: bold;
            margin-top: 8px;
            padding: 6px 12px;
            background: #ffe0e0;
            border-radius: 8px;
        `;
        status.parentNode.insertBefore(errorDiv, status.nextSibling);
    }
    localStorage.removeItem("errorCode"); // 顯示完清除

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
        const offset = circumference - (current / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        text.textContent = current.toFixed(2) + '%';
    }, stepTime);
}
