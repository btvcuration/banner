let currentDashboardData = [];
// 가격 변동 탭용 글로벌 데이터 배열 추가
let globalPriceDropData = [];

const FALLBACK_POSTER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='58' viewBox='0 0 40 58'%3E%3Crect width='40' height='58' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='10' font-family='sans-serif'%3ENo Img%3C/text%3E%3C/svg%3E";
const FALLBACK_THUMB = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='28' viewBox='0 0 20 28'%3E%3Crect width='20' height='28' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='7' font-family='sans-serif'%3ENo%3C/text%3E%3C/svg%3E";

document.addEventListener('DOMContentLoaded', async () => {
    checkAndInit();
});

async function checkAndInit() {
    let tab = await getActiveTab(false);
    if (!tab || !tab.url.includes("ncms.skbroadband.com:8443/contents/")) {
        document.getElementById('wrongPageOverlay').style.display = 'flex';
        document.getElementById('movePageBtn').onclick = () => {
            chrome.tabs.update(tab.id, { url: "https://ncms.skbroadband.com:8443/contents/title/titleList.do" });
            document.getElementById('wrongPageOverlay').style.display = 'none';
            setTimeout(() => checkAndInit(), 2000);
        };
        return;
    }
    
    document.getElementById('wrongPageOverlay').style.display = 'none';
    initTabs();
    initDashboard();
    
    chrome.storage.local.get(['savedResults'], (data) => {
        if (data.savedResults && data.savedResults.length > 0) buildPosterTable(data.savedResults);
    });
}

async function getActiveTab(showAlert = true) {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;
    if (!tab.url.includes("ncms.skbroadband.com")) {
        if (showAlert) alert("NCMS 페이지가 아닙니다.");
        return null;
    }
    return tab;
}

function initTabs() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            const targetId = this.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            this.classList.add('active');

            // 가격 변동 탭 클릭 시 최초 1회 자동 스캔
            if (targetId === 'tab-pricedrop' && globalPriceDropData.length === 0) {
                document.getElementById('pd-scan-btn').click();
            }
        });
    });

    let selectAllCheckbox = document.getElementById('selectAllCats');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            let isChecked = e.target.checked;
            document.querySelectorAll('.cat-filter').forEach(cb => {
                cb.checked = isChecked;
            });
            updateCalendarCounts();
            let activeBox = document.querySelector('.cal-box.active');
            if(activeBox) renderDayList(activeBox.dataset.date);
        });
    }

    document.querySelectorAll('.cat-filter, #posterMissingFilter').forEach(el => {
        el.addEventListener('change', (e) => {
            if (e.target.classList.contains('cat-filter') && selectAllCheckbox) {
                let allChecked = Array.from(document.querySelectorAll('.cat-filter')).every(cb => cb.checked);
                selectAllCheckbox.checked = allChecked;
            }

            updateCalendarCounts();
            let activeBox = document.querySelector('.cal-box.active');
            if(activeBox) renderDayList(activeBox.dataset.date);
        });
    });
    let today = new Date();
    let nextWeek = new Date();
    nextWeek.setDate(today.getDate() - 7);
    
    let startEl = document.getElementById('exStartDt');
    let endEl = document.getElementById('exEndDt');
    
    if (startEl && endEl) {
        startEl.value = today.toISOString().split('T')[0];
        endEl.value = nextWeek.toISOString().split('T')[0];
    }
}

function injectScript(funcName, argsArray, callback) {
    getActiveTab(false).then(tab => {
        if (!tab) return;
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: funcName,
            args: argsArray || []
        }, (results) => {
            if (callback && results && results[0]) callback(results[0].result);
        });
    });
}

function getFilteredData() {
    let cats = Array.from(document.querySelectorAll('.cat-filter:checked')).map(cb => cb.value);
    let posterMissingOnly = document.getElementById('posterMissingFilter').checked;

    return currentDashboardData.filter(item => {
        let metaNm = item.metaNm || "";
        let isMovie = metaNm.includes("영화");
        let isDrama = metaNm.includes("드라마");
        let isEnter = metaNm.includes("예능") || metaNm.includes("음악");
        let isAni = metaNm.includes("애니");
        let isKids = metaNm.includes("키즈") || metaNm.includes("동화");
        let isAdult = metaNm.includes("성인") || metaNm.includes("에로");
        let isOther = !isMovie && !isDrama && !isEnter && !isAni && !isKids && !isAdult;

        let catMatch = false;
        if (cats.includes("영화") && isMovie) catMatch = true;
        if (cats.includes("드라마") && isDrama) catMatch = true;
        if (cats.includes("예능") && isEnter) catMatch = true;
        if (cats.includes("애니") && isAni) catMatch = true;
        if (cats.includes("키즈") && isKids) catMatch = true;
        if (cats.includes("기타") && isOther) catMatch = true;
        if (cats.includes("성인") && isAdult) catMatch = true;

        if (!catMatch && cats.length > 0) return false;
        if (posterMissingOnly && item.hasPoster) return false;
        return true;
    });
}

function initDashboard() {
    document.getElementById('calendarView').innerHTML = '<div style="font-size:12px; padding:10px;">데이터 불러오는 중...</div>';
    injectScript(injectedFetchDashboard, [], (data) => {
        if (!data || data.error) {
            document.getElementById('calendarView').innerHTML = '<div style="font-size:12px; padding:10px; color:var(--accent-red);">오류 발생</div>';
            return;
        }
        currentDashboardData = data;
        renderCalendar();
    });
}

function renderCalendar() {
    let calView = document.getElementById('calendarView');
    calView.innerHTML = '';
    
    let sortedDates = [...new Set(currentDashboardData.map(d => d.svcDt))].sort();
    
    let allBox = document.createElement('div');
    allBox.className = 'cal-box active';
    allBox.dataset.date = 'ALL';
    allBox.innerHTML = `<div class="cal-date">전체</div><div class="cal-count">0</div>`;
    allBox.addEventListener('click', function() {
        document.querySelectorAll('.cal-box').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        renderDayList('ALL');
    });
    calView.appendChild(allBox);

    sortedDates.forEach((dateStr) => {
        let fDate = `${dateStr.substring(4,6)}/${dateStr.substring(6,8)}`;
        let box = document.createElement('div');
        box.className = 'cal-box';
        box.dataset.date = dateStr;
        box.innerHTML = `<div class="cal-date">${fDate}</div><div class="cal-count">0</div>`;
        box.addEventListener('click', function() {
            document.querySelectorAll('.cal-box').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderDayList(dateStr);
        });
        calView.appendChild(box);
    });

    updateCalendarCounts();
    renderDayList('ALL');
}

function updateCalendarCounts() {
    let filtered = getFilteredData();
    let countMap = { 'ALL': filtered.length };
    filtered.forEach(i => { countMap[i.svcDt] = (countMap[i.svcDt] || 0) + 1; });

    document.querySelectorAll('.cal-box').forEach(box => {
        let d = box.dataset.date;
        box.querySelector('.cal-count').innerText = countMap[d] || 0;
    });
}

function renderDayList(dateStr) {
    let listArea = document.getElementById('dashboardListArea');
    if (!dateStr) return;

    let filtered = getFilteredData();
    if (dateStr !== 'ALL') filtered = filtered.filter(item => item.svcDt === dateStr);

    listArea.innerHTML = '';
    if (filtered.length === 0) {
        listArea.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-sub); font-size: 12px;">결과가 없습니다.</div>';
        return;
    }

    filtered.forEach((item, idx) => {
        let div = document.createElement('div');
        let imgUrl = item.hasPoster ? item.posterUrl : FALLBACK_POSTER;
        let typeBadge = item.isSeason ? `<span style="color:#e15255; font-size:10px;">[시즌]</span>` : `<span style="color:#9da0f2; font-size:10px;">[단편]</span>`;
        let unschedBadge = item.isUnscheduled ? `<span style="background-color:#e15255; color:white; padding:1px 4px; border-radius:3px; font-size:10px; margin-right:4px;">미편성</span>` : "";
        let uhdBadge = item.hasUhd ? `<span style="background-color:#8a2be2; color:white; padding:1px 4px; border-radius:3px; font-size:10px; margin-right:4px;">UHD</span>` : "";
        let displayMetaId = item.metaId || "-";

        div.innerHTML = `
            <div class="list-item" id="dash-item-${idx}">
                <img src="${imgUrl}" class="list-poster dyn-img">
                <div class="list-info">
                    <div class="list-title">${unschedBadge}${uhdBadge}${typeBadge} ${item.title}</div>
                    <div class="list-sub">${item.metaNm.replace(/\[|\]/g, ' ')} | ID: ${item.srisId} | Meta: ${displayMetaId}</div>
                </div>
            </div>
            <div id="dash-detail-${idx}" class="detail-box">로딩 중...</div>
        `;
        listArea.appendChild(div);

        div.querySelector('.dyn-img').addEventListener('error', function() {
            if (this.src !== FALLBACK_POSTER) this.src = FALLBACK_POSTER;
        });
        
        div.querySelector('.list-item').addEventListener('click', () => toggleDetail(`dash-detail-${idx}`, item.srisId, item.isSeason, item.tvStatus, item.tvMdaStatus));
    });
}

document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('searchBtn').click();
    }
});

document.getElementById('searchBtn').addEventListener('click', () => {
    let keyword = document.getElementById('searchInput').value.trim();
    if (!keyword) return alert("검색어를 입력해주세요.");
    let schType = document.querySelector('input[name="schType"]:checked').value;
    
    let resArea = document.getElementById('searchResults');
    resArea.innerHTML = `<div style="text-align:center; font-size: 12px;">검색 중...</div>`;

    injectScript(injectedSearchTitle, [keyword, schType], (list) => {
        if (!list || list.length === 0) {
            resArea.innerHTML = `<div style="text-align:center; color: var(--accent-red); font-size: 12px;">검색 결과가 없습니다.</div>`;
            return;
        }

        resArea.innerHTML = '';
        list.forEach((item, idx) => {
            let imgUrl = item.hasPoster ? item.posterUrl : FALLBACK_POSTER;
            let unschedBadge = item.isUnscheduled ? `<span style="background-color:#e15255; color:white; padding:1px 4px; border-radius:3px; font-size:10px; margin-right:4px;">미편성</span>` : "";
            let uhdBadge = item.hasUhd ? `<span style="background-color:#8a2be2; color:white; padding:1px 4px; border-radius:3px; font-size:10px; margin-right:4px;">UHD</span>` : "";
            let typeBadge = item.isSeason ? `<span style="color:#e15255; font-size:10px;">[시즌]</span>` : `<span style="color:#9da0f2; font-size:10px;">[단편]</span>`;
            let displayMetaId = item.metaId || "-";

            let div = document.createElement('div');
            div.innerHTML = `
                <div class="list-item" id="sch-item-${idx}">
                    <img src="${imgUrl}" class="list-poster dyn-img">
                    <div class="list-info">
                        <div class="list-title">${unschedBadge}${uhdBadge}${typeBadge} ${item.title}</div>
                        <div class="list-sub">${item.metaNm.replace(/\[|\]/g, ' ')} | ID: ${item.srisId} | Meta: ${displayMetaId}</div>
                    </div>
                </div>
                <div id="sch-detail-${idx}" class="detail-box">로딩 중...</div>
            `;
            resArea.appendChild(div);

            div.querySelector('.dyn-img').addEventListener('error', function() {
                if (this.src !== FALLBACK_POSTER) this.src = FALLBACK_POSTER;
            });
            
            div.querySelector('.list-item').addEventListener('click', () => toggleDetail(`sch-detail-${idx}`, item.srisId, item.isSeason, item.tvStatus, item.tvMdaStatus));
        });
    });
});

function formatPriceNum(numStr) {
    let p = parseInt(numStr);
    return isNaN(p) ? numStr : p.toLocaleString();
}

function buildPriceHtml(epsdId, epsdDataObj) {
    let data = epsdDataObj[epsdId];
    if (!data || data.prices.length === 0) return "가격 정보 없음";
    
    let d = new Date();
    let todayNum = parseInt(d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0'));
    
    let rentalHtml = "";
    let purchaseHtml = "";

    data.prices.forEach(p => {
        let pId = `price-dtl-${Math.random().toString(36).substr(2,9)}`;
        let currentSch = p.details.find(d => {
            let s = parseInt((d.startRaw || "0").substring(0,8));
            let e = parseInt((d.endRaw || "99991231").substring(0,8));
            return s <= todayNum && e >= todayNum;
        }) || p.details[0];
        
        let currentStr = currentSch ? `${formatPriceNum(currentSch.price)}원 (~${currentSch.end})` : `${formatPriceNum(p.price)}원`;
        
        let dtlListHtml = p.details.map(d => `<div style="margin-top:3px;">- <span style="color:var(--accent-purple);">[${d.policyType || '일반'}]</span> ${d.start} ~ ${d.end}: ${formatPriceNum(d.price)}원</div>`).join('');
        
        let itemHtml = `
            <div style="margin-bottom:4px; padding-left:6px;">
                ${p.type} <span style="font-weight:bold; color:var(--accent-purple);">${currentStr}</span>
                <button class="price-detail-btn" data-target="${pId}">상세</button>
                <div id="${pId}" class="price-detail-box">${dtlListHtml || "일정 없음"}</div>
            </div>
        `;

        if (p.isPossn) purchaseHtml += itemHtml;
        else rentalHtml += itemHtml;
    });

    let result = "";
    if (rentalHtml) result += `<div style="font-weight:bold; color:#9da0f2; margin-bottom:2px;">[대여]</div>` + rentalHtml;
    if (purchaseHtml) result += `<div style="font-weight:bold; color:#10b981; margin:6px 0 2px 0;">[소장]</div>` + purchaseHtml;
    return result;
}

function bindPriceEvents(container) {
    container.querySelectorAll('.price-detail-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let targetId = e.target.getAttribute('data-target');
            let el = document.getElementById(targetId);
            if (el) el.style.display = (el.style.display === 'block' ? 'none' : 'block');
        });
    });
}

function toggleDetail(detailId, srisId, isSeason, passedTvStatus, passedTvMdaStatus) {
    let box = document.getElementById(detailId);
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (box.innerHTML !== '로딩 중...') return; 

    injectScript(injectedFetchDetail, [srisId, isSeason, passedTvStatus, passedTvMdaStatus], (detail) => {
        if (!detail || detail.error) {
            box.innerHTML = `<span style="color:var(--accent-red);">상세 정보를 불러올 수 없습니다.</span>`;
            return;
        }

        let tvStatusHtml = detail.tvStatus.includes("배포승인") ? `<span class="badge badge-ok">RTSP 배포승인</span>` : `<span class="badge badge-err">RTSP ${detail.tvStatus}</span>`;
        let tvMdaStatusHtml = detail.tvMdaStatus.includes("배포승인") ? `<span class="badge badge-ok">HLS 배포승인</span>` : `<span class="badge badge-err">HLS ${detail.tvMdaStatus}</span>`;
        let mediaHtml = `${tvStatusHtml} ${tvMdaStatusHtml}`;

        let hasUhd = false;
        for(let key in detail.epsdData) { if(detail.epsdData[key].hasUhd) hasUhd = true; }
        let uhdBadge = hasUhd ? `<span class="badge badge-uhd">UHD 편성</span>` : "";

        let epIdHtml = detail.epsdIds.length > 0 
            ? detail.epsdIds.map((id, idx) => `<span class="ep-link ${idx === 0 ? 'active' : ''}" data-epid="${id}">${id}</span>`).join(' / ') 
            : "에피소드 없음";
        
        let firstEpId = detail.epsdIds[0];
        let initialPriceHtml = firstEpId ? buildPriceHtml(firstEpId, detail.epsdData) : "가격 정보 없음";
        let initialSubHtml = firstEpId && detail.epsdData[firstEpId] ? detail.epsdData[firstEpId].subscription : "월정액 없음";

        let tmdbHtml = (detail.tmdb && detail.tmdb !== "-") 
            ? `<a href="https://www.themoviedb.org/movie/${detail.tmdb}" target="_blank" style="color:#9da0f2; text-decoration:underline; font-weight:bold;">${detail.tmdb}</a>` 
            : "-";

        box.innerHTML = `
            <div class="detail-row"><span class="detail-title">에피 ID</span> ${epIdHtml}</div>
            <div class="detail-row"><span class="detail-title">편성기간</span> <span style="color:var(--text-sub);">${detail.svcPeriod}</span></div>
            <div class="detail-row"><span class="detail-title">서비스유형</span> <span style="color:#f59e0b; font-weight:bold;">${detail.svcTypNm}</span></div>
            <div class="detail-row"><span class="detail-title">카테고리</span> <span style="color:#10b981; font-weight:bold;">${detail.category}</span></div>
            <div class="detail-row"><span class="detail-title">장르 / 코드</span> ${detail.genre} / 영진위: ${detail.kofic} / TMDB: ${tmdbHtml}</div>
            <div class="detail-row"><span class="detail-title">부가정보</span> 월정액: <span class="subscription-info-container" style="color:#9da0f2;">${initialSubHtml}</span> / 연령: <span style="color:#e15255; font-weight:bold;">${detail.ageRating}</span></div>
            <div class="detail-row"><span class="detail-title">가격정보</span> <div class="price-info-container" style="display:inline-block; vertical-align:top;">${initialPriceHtml}</div></div>
            <div class="detail-row"><span class="detail-title">상태점검</span> 
                ${mediaHtml} 
                <span class="badge ${detail.todayBtv ? 'badge-ok' : 'badge-warn'}">Today ${detail.todayBtv ? '매핑됨' : '없음'}</span>
                ${uhdBadge}
            </div>
        `;
        
        bindPriceEvents(box);

        box.querySelectorAll('.ep-link').forEach(link => {
            link.addEventListener('click', (e) => {
                let clickedId = e.target.dataset.epid;
                let priceContainer = box.querySelector('.price-info-container');
                
                priceContainer.innerHTML = buildPriceHtml(clickedId, detail.epsdData);
                box.querySelector('.subscription-info-container').innerText = detail.epsdData[clickedId]?.subscription || "월정액 없음";
                
                bindPriceEvents(priceContainer);

                box.querySelectorAll('.ep-link').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    });
}

document.getElementById('runPosterBtn').addEventListener('click', () => {
    const titles = document.getElementById('titleKeywords').value.split('\n').map(k => k.trim()).filter(k => k !== '');
    const seasons = document.getElementById('seasonKeywords').value.split('\n').map(k => k.trim()).filter(k => k !== '');

    if (titles.length === 0 && seasons.length === 0) return alert("검색어를 입력해주세요.");

    document.getElementById('posterStatus').innerText = "추출 중...";
    document.getElementById('resultSection').style.display = 'block';

    injectScript(injectedRunBatchPoster, [titles, seasons], (newResults) => {
        document.getElementById('posterStatus').innerText = "";
        if (newResults) {
            chrome.storage.local.get(['savedResults'], (data) => {
                let combined = (data.savedResults || []).concat(newResults);
                chrome.storage.local.set({ savedResults: combined }, () => {
                    buildPosterTable(combined);
                    document.getElementById('titleKeywords').value = '';
                    document.getElementById('seasonKeywords').value = '';
                });
            });
        }
    });
});

function buildPosterTable(results) {
    const tbody = document.getElementById('resultBody');
    tbody.innerHTML = '';

    results.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        const makePreview = (url) => {
            if(url && url !== "-" && !url.includes("없음")) return `<a href="${url}" target="_blank"><img src="${url}" class="thumb prev-img"></a>`;
            return `<img src="${FALLBACK_THUMB}" class="thumb">`;
        };

        tr.innerHTML = `
            <td style="text-align:center;"><input type="checkbox" class="rowCheck" data-index="${index}" checked></td>
            <td style="font-weight:bold;">${row.srisNm}<br><span style="font-size:9px; color:var(--text-sub);">${row.keyword}</span></td>
            <td>${row.mainEpsdId}</td>
            <td class="url-cell" title="${row.hUrl}">${makePreview(row.hUrl)}${row.hUrl}</td>
            <td class="url-cell" title="${row.vUrl}">${makePreview(row.vUrl)}${row.vUrl}</td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.prev-img').forEach(img => {
        img.addEventListener('error', function() { if (this.src !== FALLBACK_THUMB) this.src = FALLBACK_THUMB; });
    });
    
    document.getElementById('resultSection').style.display = results.length > 0 ? 'block' : 'none';
    document.getElementById('selectAll').checked = results.length > 0;
}

document.getElementById('selectAll').addEventListener('change', e => document.querySelectorAll('.rowCheck').forEach(cb => cb.checked = e.target.checked));

document.getElementById('copyBtn').addEventListener('click', () => {
    let checkboxes = document.querySelectorAll('.rowCheck:checked');
    if (checkboxes.length === 0) return alert("항목을 선택해주세요.");

    chrome.storage.local.get(['savedResults'], (data) => {
        let results = data.savedResults || [];
        let textToCopy = "시리즈명\t대표에피_ID\t가로_URL\t세로_URL\n";
        
        checkboxes.forEach(cb => { 
            let row = results[cb.dataset.index]; 
            if(row) textToCopy += `${row.srisNm}\t${row.mainEpsdId}\t${row.hUrl}\t${row.vUrl}\n`; 
        });

        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = textToCopy;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        
        try {
            document.execCommand('copy');
            alert(`클립보드에 복사되었습니다.`);
        } catch (err) {
            alert(`복사에 실패했습니다: ${err}`);
        } finally {
            document.body.removeChild(tempTextArea);
        }
    });
});

document.getElementById('clearBtn').addEventListener('click', () => {
    let checkboxes = document.querySelectorAll('.rowCheck:checked');
    if (checkboxes.length === 0) return alert("항목을 선택해주세요.");
    
    if(confirm(`선택한 항목을 삭제하시겠습니까?`)) {
        chrome.storage.local.get(['savedResults'], (data) => {
            let results = data.savedResults || [];
            let indices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index)).sort((a,b) => b - a);
            
            indices.forEach(idx => results.splice(idx, 1));
            chrome.storage.local.set({ savedResults: results }, () => buildPosterTable(results));
        });
    }
});


// ----------------------------------------------------------
// 가격 변동 탭 이벤트 리스너 및 렌더링 로직 추가
// ----------------------------------------------------------

const pdSelectAll = document.getElementById('pd-selectAllCats');
if (pdSelectAll) {
    pdSelectAll.addEventListener('change', (e) => {
        document.querySelectorAll('.pd-cat-filter').forEach(cb => cb.checked = e.target.checked);
        renderPriceDrops();
    });
}

document.querySelectorAll('.pd-cat-filter').forEach(el => {
    el.addEventListener('change', () => {
        let allChecked = Array.from(document.querySelectorAll('.pd-cat-filter')).every(cb => cb.checked);
        if(pdSelectAll) pdSelectAll.checked = allChecked;
        renderPriceDrops();
    });
});
document.querySelectorAll('#pd-date-filter, #pd-aud-filter, #pd-price-filter').forEach(el => {
    el.addEventListener('change', renderPriceDrops);
});

document.getElementById('pd-scan-btn').addEventListener('click', () => {
    document.getElementById('pd-status').innerHTML = "⏳ 서버에서 데이터를 병렬 수집 중입니다... (약 5~10초 소요)";
    document.getElementById('pd-scan-btn').disabled = true;
    document.getElementById('pd-scan-btn').style.opacity = '0.5';
    
    injectScript(injectedFetchPriceDrops, [], (results) => {
        document.getElementById('pd-scan-btn').disabled = false;
        document.getElementById('pd-scan-btn').style.opacity = '1';
        
        if (!results || results.error) {
            document.getElementById('pd-status').innerHTML = `<span style="color:var(--accent-red);">데이터를 가져오지 못했습니다. 다시 시도해주세요.</span>`;
            return;
        }
        
        globalPriceDropData = results;
        renderPriceDrops(); 
    });
});

document.getElementById('pd-copy-btn').addEventListener('click', () => {
    const renderedItems = Array.from(document.querySelectorAll('.pd-rendered-item'));
    if (renderedItems.length === 0) return alert("복사할 데이터가 없습니다.");

    let textToCopy = "타이틀명\t시리즈ID\n";
    renderedItems.forEach(el => {
        let title = el.getAttribute('data-title');
        let srisId = el.getAttribute('data-srisid');
        textToCopy += `${title}\t${srisId}\n`;
    });

    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = textToCopy;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    
    try {
        document.execCommand('copy');
        alert(`선택된 ${renderedItems.length}건의 타이틀명과 시리즈ID가 클립보드에 복사되었습니다.`);
    } catch (err) {
        alert(`복사 실패: ${err}`);
    } finally {
        document.body.removeChild(tempTextArea);
    }
});

function renderPriceDrops() {
    const resultArea = document.getElementById('pd-result-area');
    resultArea.innerHTML = "";

    if (globalPriceDropData.length === 0) return;

    const activeCats = Array.from(document.querySelectorAll('.pd-cat-filter:checked')).map(cb => cb.value);
    const maxDays = parseInt(document.getElementById('pd-date-filter').value, 10);
    const minAudience = parseInt(document.getElementById('pd-aud-filter').value, 10) || 0;
    const targetPriceText = document.getElementById('pd-price-filter').value;
    const targetPrice = parseInt(targetPriceText, 10);

    const filtered = globalPriceDropData.filter(item => {
        if (!activeCats.includes(item.metaCode)) return false; 
        if (item.daysDiff > maxDays || item.daysDiff < 0) return false; 
        if (item.rawAudience < minAudience) return false; 
        
        if (targetPriceText !== "" && !isNaN(targetPrice)) {
            if (item.rawTargetRentPrice !== targetPrice) return false; 
        }

        return true;
    });

    document.getElementById('pd-status').innerHTML = `<span style="color:#10b981; font-weight:bold;">✅ 필터 적용됨:</span> 총 ${globalPriceDropData.length}건 확보 중 <b>${filtered.length}건</b> 표시`;

    if (filtered.length === 0) {
        resultArea.innerHTML = `<div style="text-align:center; padding: 15px; color: var(--text-sub);">조건에 맞는 타이틀이 없습니다.</div>`;
        return;
    }

    filtered.forEach(item => {
        let div = document.createElement('div');
        div.className = "list-item pd-rendered-item";
        div.style.flexDirection = "column";
        div.style.alignItems = "flex-start";
        div.setAttribute('data-title', item.title);
        div.setAttribute('data-srisid', item.srisId);

        div.innerHTML = `
            <div style="font-weight:bold; font-size:13px; color:white; margin-bottom:4px;">
                [${item.pocName}] ${item.title} <span style="font-size:10px; color:var(--text-sub);">(${item.rslu}) | 🆔 ${item.srisId}</span>
            </div>
            <div style="font-size:11px; color:var(--text-sub); display:flex; flex-wrap:wrap; gap:6px;">
                <span>📅 D+${item.daysDiff} (${item.formattedDate})</span>
                <span>|</span>
                <span>👥 ${item.audienceText}</span>
                <span>|</span>
                <span style="color:var(--accent-purple); font-weight:bold;">📚 ${item.libChange}</span>
            </div>
            <div style="font-size:11px; margin-top:4px; padding:6px; background:rgba(0,0,0,0.3); border-radius:4px; width:100%; box-sizing:border-box;">
                <div style="color:#ddd;">대여: ${item.rentChange}</div>
                <div style="color:#ddd; margin-top:2px;">소장: ${item.ownChange}</div>
            </div>
        `;
        resultArea.appendChild(div);
    });
}


// ==========================================
// NCMS MAIN PAGE SCRIPT INJECTIONS
// ==========================================

async function injectedFetchDashboard() {
    var csrf = document.querySelector("input[name='_csrf']")?.value;
    if (!csrf) return { error: true };

    function getCatPath(metaNm) {
        if (!metaNm) return "movie";
        if (metaNm.includes("영화")) return "movie";
        if (metaNm.includes("드라마")) return "drama";
        if (metaNm.includes("예능") || metaNm.includes("음악")) return "enter";
        if (metaNm.includes("애니")) return "animation";
        if (metaNm.includes("키즈")) return "kids";
        if (metaNm.includes("다큐")) return "docu";
        if (metaNm.includes("교육")) return "edu";
        if (metaNm.includes("시사") || metaNm.includes("교양")) return "current";
        if (metaNm.includes("스포츠")) return "sport";
        if (metaNm.includes("성인") || metaNm.includes("에로")) return "adult";
        return "movie";
    }

    function findFile(obj, keyStr) {
        let found = null;
        function search(curr) {
            if (found) return;
            for (let k in curr) {
                if (typeof curr[k] === "string" && curr[k].includes(keyStr) && curr[k].includes(".jpg")) { found = curr[k]; return; } 
                else if (typeof curr[k] === "object" && curr[k] !== null) search(curr[k]);
            }
        }
        search(obj); return found;
    }

    try {
        var today = new Date();
        var nextWeek = new Date(); nextWeek.setDate(today.getDate() + 7);
        
        var fDate = d => d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
        var start = fDate(today), end = fDate(nextWeek);

        var [tRes, sRes] = await Promise.all([
            $.post('/contents/title/titleList.json', { 
                rows: 500, 
                page: 1, 
                schSvcFrDt: start,
                schSvcToDt: end,
                _csrf: csrf 
            }),
            $.post('/contents/season/seasonList.json', { 
                rows: 500, 
                page: 1, 
                schSvcFrDt: start,
                schSvcToDt: end,
                _csrf: csrf 
            })
        ]);

        var tList = tRes.result?.contents || tRes.contents || [];
        var sList = sRes.result?.contents || sRes.contents || [];
        
        tList.forEach(i => i.isSeason = false);
        sList.forEach(i => i.isSeason = true);
        var list = [...tList, ...sList];
        
        var upcoming = list.filter(t => {
            let dt = (t.svcFrDt || t.svc_fr_dt || "").substring(0,8);
            return dt >= start && dt <= end;
        });

        var results = await Promise.all(upcoming.map(async t => {
            try {
                let srisId = t.srisId || t.sris_id;
                let detApi = t.isSeason ? '/contents/season/seasonSelect.json' : '/contents/title/titleSelect.json';
                
                let detailData;
                try { detailData = await $.post(detApi, { srisId: srisId, _csrf: csrf }); } 
                catch(e) { detailData = await $.post('/contents/title/titleSelect.json', { srisId: srisId, _csrf: csrf }); }
                
                let metaId = detailData.result?.titleInfo?.metaId || detailData.titleInfo?.metaId || detailData.result?.seasonInfo?.metaId || detailData.seasonInfo?.metaId || detailData.result?.metaId || detailData.metaId || "";
                
                let metaNm = "";
                if(t.isSeason) metaNm = detailData.result?.seasonInfo?.metaTypNm || detailData.seasonInfo?.metaTypNm || "";
                else metaNm = detailData.result?.titleInfo?.metaTypNm || detailData.titleInfo?.metaTypNm || "";
                
                if(!metaNm) {
                    var epRes = await $.post('/contents/episode/episodeList.json', { srisId: srisId, _csrf: csrf, rows: 1, page: 1 });
                    let epList = epRes.result?.contents || epRes.contents || [];
                    if (epList.length > 0) metaNm = epList[0].metaTypNm || epList[0].meta_typ_nm || "";
                }

                let tvStatus = t.tvStatus || t.tv_status || "-";
                let tvMdaStatus = t.tvMdaStatus || t.tv_mda_status || "-";
                
                let todayStr = new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');
                let rawSvcFrDt = (t.svcFrDt || t.svc_fr_dt || "00000000").substring(0,8);
                let rawSvcToDt = (t.svcToDt || t.svc_to_dt || "99991231").substring(0,8);
                
                let isValidDate = (todayStr >= rawSvcFrDt && todayStr <= rawSvcToDt);
                let isApproved = tvStatus.includes("배포승인") || tvMdaStatus.includes("배포승인");
                let isUnscheduled = !isValidDate || !isApproved;

                let vFile = findFile(detailData, "TVPH");
                let hasPoster = false, pUrl = "";
                
                if (vFile) {
                    hasPoster = true;
                    let partition = metaId.slice(-2);
                    let cat = getCatPath(metaNm);
                    pUrl = `https://stimage.hanafostv.com:8443/thumbnails/iip/115_156//${cat}/${partition}/${metaId}/${vFile}`;
                }

                let hasUhd = false;
                try {
                    let epRes = await $.post('/contents/episode/episodeList.json', { srisId: srisId, _csrf: csrf, rows: 1, page: 1 });
                    let epList = epRes.result?.contents || epRes.contents || [];
                    if (epList.length > 0) {
                        let prdRes = await $.post('/common/product/layer/ppvPrdList.json', { epsdId: epList[0].epsdId, _csrf: csrf, rows: 50, page: 1 });
                        let prdList = prdRes.result?.contents || prdRes.contents || [];
                        hasUhd = prdList.some(p => {
                            let pStr = JSON.stringify(p).toUpperCase();
                            if (pStr.includes("HEB")) return false;
                            
                            let pocVal = p.pocTypCd || p.poc_typ_cd;
                            if (pocVal && String(pocVal) !== "10") return false;
                            
                            let useStatus = p.useYn || p.prdUseYn || p.epsdPrdUseYn || "Y";
                            if (String(useStatus).toUpperCase() === "N") return false;
                            
                            let endDate = p.prdPrcToDt || p.prcToDt || p.epsdPrdToDt || p.prdToDt || p.sellToDt || "";
                            let todayStr = new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');
                            if (endDate.length >= 8 && endDate.substring(0, 8) < todayStr) return false;
                            
                            return (p.rsluTypCdNm || p.rsluTypNm || "").toUpperCase().includes("UHD");
                        });
                    }
                } catch(e) {}

                return {
                    srisId: srisId,
                    metaId: metaId,
                    title: t.srisNm || t.sris_nm,
                    svcDt: rawSvcFrDt,
                    metaNm: metaNm || "-",
                    hasPoster: hasPoster,
                    posterUrl: pUrl,
                    isSeason: t.isSeason,
                    isUnscheduled: isUnscheduled,
                    tvStatus: tvStatus,
                    tvMdaStatus: tvMdaStatus,
                    hasUhd: hasUhd
                };
            } catch (err) { return null; }
        }));
        
        var validResults = results.filter(r => r !== null);
        validResults.sort((a,b) => a.svcDt.localeCompare(b.svcDt));
        return validResults;

    } catch(e) { return { error: true }; }
}

async function injectedSearchTitle(keyword, schType) {
    var csrf = document.querySelector("input[name='_csrf']")?.value;

    function getCatPath(metaNm) {
        if (!metaNm) return "movie";
        if (metaNm.includes("영화")) return "movie";
        if (metaNm.includes("드라마")) return "drama";
        if (metaNm.includes("예능") || metaNm.includes("음악")) return "enter";
        if (metaNm.includes("애니")) return "animation";
        if (metaNm.includes("키즈")) return "kids";
        if (metaNm.includes("다큐")) return "docu";
        if (metaNm.includes("교육")) return "edu";
        if (metaNm.includes("시사") || metaNm.includes("교양")) return "current";
        if (metaNm.includes("스포츠")) return "sport";
        if (metaNm.includes("성인") || metaNm.includes("에로")) return "adult";
        return "movie";
    }

    function findFile(obj, keyStr) {
        let found = null;
        function search(curr) {
            if (found) return;
            for (let k in curr) {
                if (typeof curr[k] === "string" && curr[k].includes(keyStr) && curr[k].includes(".jpg")) { found = curr[k]; return; } 
                else if (typeof curr[k] === "object" && curr[k] !== null) search(curr[k]);
            }
        }
        search(obj); return found;
    }

    try {
        var searchPayload = { seriesSchText: keyword, isSearch: "true", searchType: "integrate", tSearchShortType: "cntNm", rows: 10, page: 1, _csrf: csrf };
        var targetApi = schType === "season" ? '/contents/season/seasonList.json' : '/contents/title/titleList.json';
        
        var res = await $.post(targetApi, searchPayload);
        var list = res.result?.contents || res.contents || [];
        
        var results = await Promise.all(list.map(async item => {
            try {
                let srisId = item.srisId || item.sris_id;
                let detApi = schType === "season" ? '/contents/season/seasonSelect.json' : '/contents/title/titleSelect.json';
                
                let detailData;
                try { detailData = await $.post(detApi, { srisId: srisId, _csrf: csrf }); } 
                catch(e) { detailData = await $.post('/contents/title/titleSelect.json', { srisId: srisId, _csrf: csrf }); }
                
                let metaId = detailData.result?.titleInfo?.metaId || detailData.titleInfo?.metaId || detailData.result?.seasonInfo?.metaId || detailData.seasonInfo?.metaId || detailData.result?.metaId || detailData.metaId || "";
                
                let metaNm = "";
                if(schType === "season") metaNm = detailData.result?.seasonInfo?.metaTypNm || detailData.seasonInfo?.metaTypNm || "";
                else metaNm = detailData.result?.titleInfo?.metaTypNm || detailData.titleInfo?.metaTypNm || "";
                
                if(!metaNm) {
                    var epRes = await $.post('/contents/episode/episodeList.json', { srisId: srisId, _csrf: csrf, rows: 1, page: 1 });
                    let epList = epRes.result?.contents || epRes.contents || [];
                    if (epList.length > 0) metaNm = epList[0].metaTypNm || epList[0].meta_typ_nm || "";
                }

                let tvStatus = item.tvStatus || item.tv_status || "-";
                let tvMdaStatus = item.tvMdaStatus || item.tv_mda_status || "-";
                
                let todayStr = new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');
                let rawSvcFrDt = (item.svcFrDt || item.svc_fr_dt || "00000000").substring(0,8);
                let rawSvcToDt = (item.svcToDt || item.svc_to_dt || "99991231").substring(0,8);
                
                let isValidDate = (todayStr >= rawSvcFrDt && todayStr <= rawSvcToDt);
                let isApproved = tvStatus.includes("배포승인") || tvMdaStatus.includes("배포승인");
                let isUnscheduled = !isValidDate || !isApproved;

                let vFile = findFile(detailData, "TVPH");
                let hasPoster = false, pUrl = "";
                
                if (vFile) {
                    hasPoster = true;
                    let partition = metaId.slice(-2);
                    let cat = getCatPath(metaNm);
                    pUrl = `https://stimage.hanafostv.com:8443/thumbnails/iip/115_156//${cat}/${partition}/${metaId}/${vFile}`;
                }

                let hasUhd = false;
                try {
                    let epRes = await $.post('/contents/episode/episodeList.json', { srisId: srisId, _csrf: csrf, rows: 1, page: 1 });
                    let epList = epRes.result?.contents || epRes.contents || [];
                    if (epList.length > 0) {
                        let prdRes = await $.post('/common/product/layer/ppvPrdList.json', { epsdId: epList[0].epsdId, _csrf: csrf, rows: 50, page: 1 });
                        let prdList = prdRes.result?.contents || prdRes.contents || [];
                        hasUhd = prdList.some(p => (p.rsluTypCdNm || p.rsluTypNm || "").toUpperCase().includes("UHD"));
                    }
                } catch(e) {}

                return {
                    title: item.srisNm || item.sris_nm,
                    srisId: srisId,
                    metaId: metaId,
                    metaNm: metaNm || "-",
                    hasPoster: hasPoster,
                    posterUrl: pUrl,
                    isSeason: schType === "season",
                    isUnscheduled: isUnscheduled,
                    tvStatus: tvStatus,
                    tvMdaStatus: tvMdaStatus,
                    hasUhd: hasUhd
                };
            } catch (err) { return null; }
        }));
        return results.filter(r => r !== null);
    } catch(e) { return []; }
}

async function injectedFetchDetail(srisId, isSeason, passedTvStatus, passedTvMdaStatus) {
    var csrf = document.querySelector("input[name='_csrf']")?.value;
    var info = { epsdIds:[], epsdData:{}, category:"-", genre:"-", kofic:"-", tmdb:"-", todayBtv:false, tvStatus:passedTvStatus || "-", tvMdaStatus:passedTvMdaStatus || "-", ageRating: "정보 없음", svcPeriod: "-", svcTypNm: "-" };
    
    function formatDate(dtRaw) {
        if (!dtRaw || dtRaw.length < 8) return "-";
        if (dtRaw.startsWith('9999')) return "제한없음";
        return `${dtRaw.substring(0,4)}.${dtRaw.substring(4,6)}.${dtRaw.substring(6,8)}`;
    }

    function findValueDeep(obj, targetKey) {
        let result = null;
        function search(curr) {
            if (result !== null) return;
            for (let k in curr) {
                if (k === targetKey) { result = curr[k]; return; }
                if (typeof curr[k] === 'object' && curr[k] !== null) search(curr[k]);
            }
        }
        search(obj);
        return result;
    }

    try {
        var epRes = await $.post('/contents/episode/episodeList.json', { srisId: srisId, _csrf: csrf, rows: 200, page: 1 });
        var epList = epRes.result?.contents || epRes.contents || [];
        
        var mainEps = epList.filter(e => e.pcimTypCd === "10" || String(e.epsdTypNm).includes("본편") || String(e.epsdTypNm).includes("영화"));
        if(mainEps.length === 0) mainEps = epList;

        mainEps = mainEps.sort((a, b) => parseInt(a.brcastTmsVal || 999) - parseInt(b.brcastTmsVal || 999));
        
        // 🚀 단편(영화)도 UHD 처리를 위해 최대 3개까지 에피소드 ID 확보
        var sliceCount = 3; 
        info.epsdIds = mainEps.slice(0, sliceCount).map(e => e.epsdId);
        
        let primaryEpsdId = info.epsdIds[0] || "-";

        let detApi = isSeason ? '/contents/season/seasonSelect.json' : '/contents/title/titleSelect.json';
        var detail;
        try { detail = await $.post(detApi, { srisId: srisId, _csrf: csrf }); } 
        catch(e) { detail = await $.post('/contents/title/titleSelect.json', { srisId: srisId, _csrf: csrf }); }
        
        let svcFrDt = findValueDeep(detail, "svcFrDt") || findValueDeep(detail, "svc_fr_dt") || "";
        let svcToDt = findValueDeep(detail, "svcToDt") || findValueDeep(detail, "svc_to_dt") || "";
        info.svcPeriod = `${formatDate(svcFrDt)} ~ ${formatDate(svcToDt)}`;

        var metaId = detail.result?.titleInfo?.metaId || detail.titleInfo?.metaId || detail.result?.seasonInfo?.metaId || detail.seasonInfo?.metaId || detail.result?.metaId || detail.metaId;
        
        let titleOrSeasonInfo = detail.result?.titleInfo || detail.titleInfo || detail.result?.seasonInfo || detail.seasonInfo || detail;
        
        let epSvcTypNm = "";
        if (epList && epList.length > 0) {
            epSvcTypNm = epList[0].svcTypNm || epList[0].svc_typ_nm || "";
        }
        info.svcTypNm = epSvcTypNm || titleOrSeasonInfo.svcTypNm || titleOrSeasonInfo.svc_typ_nm || "일반 VOD";

        if (metaId) {
            var relRes = await $.post('/meta/contentsMetaRelation.json', { metaId: metaId, _csrf: csrf });
            var metaInfo = relRes.result?.metaInfo || relRes.metaInfo || {};
            
            let catArr = relRes.result?.metaCatCdInfo || relRes.metaCatCdInfo || [];
            if(catArr.length > 0) {
                let pCat = catArr[0].parCdNm || "";
                let cCat = catArr[0].catCdNm || "";
                if (pCat && cCat) info.category = `${pCat} > ${cCat}`;
                else info.category = pCat || cCat || "-";
            }

            let allGenres = metaInfo.genre || ""; 
            let repGenre = metaInfo.repGenre || ""; 
            let repSpan = `<span style="color:var(--accent-red); font-weight:bold;">${repGenre}</span>`;
            
            if (allGenres && repGenre) {
                let parts = allGenres.split(',').map(s => s.trim());
                let mapped = parts.map(p => p === repGenre ? repSpan : p);
                if (!mapped.some(p => p.includes(repSpan))) mapped.push(repSpan);
                info.genre = mapped.join(', ');
            } else if (repGenre) {
                info.genre = repSpan;
            } else {
                info.genre = allGenres || "정보 없음";
            }

            info.kofic = metaInfo.koficId || "-";
            info.tmdb = metaInfo.tmdbId || "-";

            let genreMasterList = relRes.result?.genreMasterList || relRes.genreMasterList || [];
            let hasHeroGenre = genreMasterList.some(g => {
                let nm = (g.text || g.metaGnrNm || "").toLowerCase();
                return nm.includes("today") || nm.includes("투데이") || nm.includes("히어로") || nm.includes("hero");
            });

            var imgRes = await $.post('/meta/imageMetaList.json', { metaId: metaId, _csrf: csrf }).catch(()=>({}));
            var imgList = Array.isArray(imgRes) ? imgRes : (imgRes.result?.imageMetaList || imgRes.result?.rows || imgRes.result?.contents || imgRes.rows || imgRes.contents || []);
            
            let hasTodayImg = imgList.some(img => {
                let nm = (img.imgTypNm || img.imgTypCd || "").toLowerCase();
                return nm.includes("today") || nm.includes("투데이") || nm.includes("히어로") || nm.includes("hero");
            });
            
            info.todayBtv = hasHeroGenre || hasTodayImg;

            if (!info.todayBtv) {
                let foundInDetail = false;
                function searchToday(obj) {
                    if (foundInDetail) return;
                    for (let k in obj) {
                        if (typeof obj[k] === 'string') {
                            let val = obj[k].toLowerCase(); let key = k.toLowerCase();
                            if ((key.includes('today') || key.includes('hero') || key.includes('투데이') || key.includes('히어로')) && (val === 'y' || val.includes('.jpg') || val.includes('.png'))) { foundInDetail = true; return; }
                        } else if (typeof obj[k] === 'object' && obj[k] !== null) searchToday(obj[k]);
                    }
                }
                searchToday(detail);
                info.todayBtv = foundInDetail;
            }
        }

        let todayStr = new Date().getFullYear() + String(new Date().getMonth()+1).padStart(2,'0') + String(new Date().getDate()).padStart(2,'0');

        for (let epId of info.epsdIds) {
            let epData = { prices: [], subscription: "정보 없음", hasUhd: false };
            
            try {
                let ppmRes = await $.post('/common/product/layer/ppmPrdList.json', { epsdId: epId, _csrf: csrf, rows: 100, page: 1 });
                let ppmList = ppmRes.result?.contents || ppmRes.contents || [];
                
                // 🚀 월정액 더미/PoC 차단 필터 적용
                ppmList = ppmList.filter(p => {
                    let pocVal = p.pocTypCd || p.poc_typ_cd;
                    if (pocVal && String(pocVal) !== "10") return false;
                    let useStatus = p.useYn || p.prdUseYn || p.epsdPrdUseYn || "Y";
                    if (String(useStatus).toUpperCase() === "N") return false;
                    let endDate = p.prdPrcToDt || p.prcToDt || p.epsdPrdToDt || p.prdToDt || p.sellToDt || "";
                    if (endDate.length >= 8 && endDate.substring(0, 8) < todayStr) return false;
                    return true;
                });

                if (ppmList.length > 0) epData.subscription = ppmList.map(p => p.prdNm || p.prd_nm).join(', ');
            } catch(e) {}

            try {
                let prdRes = await $.post('/common/product/layer/ppvPrdList.json', { epsdId: epId, _csrf: csrf, rows: 100, page: 1 });
                let prdList = prdRes.result?.contents || prdRes.contents || [];
                
                for (let p of prdList) {
                    // 🚀 PPV 더미/PoC 차단 필터 적용
                    let pStr = JSON.stringify(p).toUpperCase();
                    if (pStr.includes("HEB")) continue;
                    let pocVal = p.pocTypCd || p.poc_typ_cd;
                    if (pocVal && String(pocVal) !== "10") continue;
                    let useStatus = p.useYn || p.prdUseYn || p.epsdPrdUseYn || "Y";
                    if (String(useStatus).toUpperCase() === "N") continue;
                    let endDate = p.prdPrcToDt || p.prcToDt || p.epsdPrdToDt || p.prdToDt || p.sellToDt || "";
                    if (endDate.length >= 8 && endDate.substring(0, 8) < todayStr) continue;

                    let rslu = p.rsluTypCdNm || p.rsluTypNm || "";
                    let type = p.possnYn === "Y" ? "소장" : "대여";
                    let defaultPrice = p.prdPrice || p.prdPrc || "0";
                    let priceDetails = [];
                    let isValidProduct = false; 
                    
                    try {
                        let schRes = await $.post('/common/product/layer/ppvPrdPrcList.json', { epsdId: epId, prdId: p.prdId, cntsSvcToDt: "99991231235959", showAsisUseN: "Y", _csrf: csrf, rows: 100, page: 1 });
                        let sList = schRes.result?.commonPrdPrcDtoList || schRes.result?.rows || [];
                        
                        if (sList.length > 0) {
                            sList.forEach(sch => {
                                let sRaw = sch.prdPrcFrDt || sch.prcFrDt || "";
                                let eRaw = sch.prdPrcToDt || sch.prcToDt || "";
                                let price = sch.prdPrc || sch.prdPrice || "";
                                let schStr = JSON.stringify(sch).toUpperCase();
                                
                                if (!sRaw || !eRaw) return;
                                if (price === "-" || price === "") return;
                                if (schStr.includes("HEB")) return;
                                
                                isValidProduct = true;
                                priceDetails.push({
                                    start: formatDate(sRaw), end: formatDate(eRaw),
                                    startRaw: sRaw, endRaw: eRaw,
                                    price: price,
                                    policyType: sch.prcPocyTypCdNm || "일반"
                                });
                            });
                            
                            if (isValidProduct) {
                                defaultPrice = priceDetails[0].price;
                                let displayType = rslu && rslu !== "전체" ? `[${rslu}] ${type}` : type;
                                type = `[${priceDetails[0].policyType}] ${displayType}`;
                            }
                        } else {
                            let sRaw = p.prdPrcFrDt || p.prcFrDt || "";
                            let eRaw = p.prdPrcToDt || p.prcToDt || "";
                            
                            if (sRaw && eRaw && defaultPrice !== "-" && defaultPrice !== "") {
                                isValidProduct = true;
                                if(rslu && rslu !== "전체") type = `[${rslu}] ${type}`;
                            }
                        }
                    } catch(e) {}
                    
                    if (!isValidProduct) continue;

                    if (rslu.toUpperCase().includes("UHD")) epData.hasUhd = true;
                    epData.prices.push({ type: type, price: defaultPrice, details: priceDetails, isPossn: p.possnYn === "Y" });
                }
            } catch(e) {}
            
            info.epsdData[epId] = epData;
        }

        if (primaryEpsdId !== "-") {
            try {
                var epDetailRes = await $.post('/contents/episode/episodeSelect.json', { epsdId: primaryEpsdId, _csrf: csrf });
                var epDetailInfo = epDetailRes.result?.episodeInfo || epDetailRes.episodeInfo || epDetailRes.result || epDetailRes || {};
                var watLvlCd = epDetailInfo.ctEpsdMstDTO?.watLvlCd;
                
                if (watLvlCd !== undefined && watLvlCd !== null) {
                    const ageMap = { "0": "전체 관람가", "7": "7세 관람가", "12": "12세 관람가", "15": "15세 관람가", "19": "19세 관람가" };
                    info.ageRating = ageMap[String(watLvlCd)] || `${watLvlCd}등급`;
                }
            } catch(e) {}
        }

        return info;
    } catch(e) { return { error: true, msg: e.message }; }
}

async function injectedRunBatchPoster(titleList, seasonList) {
    var csrf = document.querySelector("input[name='_csrf']")?.value;
    if (!csrf) return null;
    var results = [];
    
    function getCatPath(metaNm) {
        if (!metaNm) return "movie";
        if (metaNm.includes("영화")) return "movie";
        if (metaNm.includes("드라마")) return "drama";
        if (metaNm.includes("예능") || metaNm.includes("음악")) return "enter";
        if (metaNm.includes("애니")) return "animation";
        if (metaNm.includes("키즈")) return "kids";
        if (metaNm.includes("다큐")) return "docu";
        if (metaNm.includes("교육")) return "edu";
        if (metaNm.includes("시사") || metaNm.includes("교양")) return "current";
        if (metaNm.includes("스포츠")) return "sport";
        if (metaNm.includes("성인") || metaNm.includes("에로")) return "adult";
        return "movie";
    }

    function findFile(obj, keyStr) {
        let found = null;
        function search(curr) {
            if (found) return;
            for (let k in curr) {
                if (typeof curr[k] === "string" && curr[k].includes(keyStr) && curr[k].includes(".jpg")) { found = curr[k]; return; } 
                else if (typeof curr[k] === "object" && curr[k] !== null) search(curr[k]);
            }
        }
        search(obj); return found;
    }
    
    function makeImageUrl(filename, isHorizontal, metaTypNm) {
        if (!filename) return "없음";
        var metaId = filename.split('_')[0];
        var partition = metaId.slice(-2);
        var cat = getCatPath(metaTypNm);
        return `https://stimage.hanafostv.com:8443/thumbnails/iip/${isHorizontal ? "2304_1296_25" : "0_0"}//${cat}/${partition}/${metaId}/${filename}`;
    }

    async function processList(keywords, isSeason) {
        var schApi = isSeason ? '/contents/season/seasonList.json' : '/contents/title/titleList.json';
        var detApi = isSeason ? '/contents/season/seasonSelect.json' : '/contents/title/titleSelect.json';

        for (let keyword of keywords) {
            try {
                var searchData = await $.post(schApi, { seriesSchText: keyword, isSearch: "true", searchType: "integrate", tSearchShortType: "cntNm", _csrf: csrf, page: 1, rows: 20 });
                var contentList = searchData.result?.contents || searchData.contents || [];
                
                if (contentList.length === 0) { results.push({ keyword: keyword, srisNm: "검색결과 없음", mainEpsdId: "-", vUrl: "-", hUrl: "-" }); continue; }
                
                var targetItem = null, finalMetaTypNm = "", finalMainEpsdId = "없음";
                
                for (let item of contentList) {
                    var sTypNm = item.svcTypNm || item.svc_typ_nm || "";
                    var sTypCd = item.svcTypCd || item.svc_typ_cd || "";
                    
                    if (!sTypNm.includes("일반 VOD") && String(sTypCd) !== "30") continue;
                    
                    var epsdData = await $.post('/contents/episode/episodeList.json', { srisId: item.srisId || item.sris_id, _csrf: csrf, rows: 200, page: 1 });
                    var epList = epsdData.result?.contents || epsdData.contents || [];
                    
                    if (epList.length > 0) {
                        targetItem = item; 
                        finalMetaTypNm = epList[0].metaTypNm || "";
                        var mainEpsd = epList.find(i => i.pcimTypCd === "10" || i.epsdTypNm === "본편");
                        if (mainEpsd) finalMainEpsdId = mainEpsd.epsdId;
                        break; 
                    }
                }

                if (!targetItem) { results.push({ keyword: keyword, srisNm: "일반 VOD 없음", mainEpsdId: "-", vUrl: "-", hUrl: "-" }); continue; }

                var srisId = targetItem.srisId || targetItem.sris_id;
                var detailData;
                try { detailData = await $.post(detApi, { srisId: srisId, _csrf: csrf }); } 
                catch (e) { detailData = await $.post('/contents/title/titleSelect.json', { srisId: srisId, _csrf: csrf }); }

                results.push({
                    keyword: keyword, srisNm: targetItem.srisNm || targetItem.sris_nm, mainEpsdId: finalMainEpsdId,
                    vUrl: makeImageUrl(findFile(detailData, "TVPH"), false, finalMetaTypNm),
                    hUrl: makeImageUrl(findFile(detailData, "TVPW"), true, finalMetaTypNm)
                });
            } catch (err) { results.push({ keyword: keyword, srisNm: "에러 발생", mainEpsdId: "-", vUrl: "-", hUrl: "-" }); }
        }
    }

    if (titleList.length > 0) await processList(titleList, false);
    if (seasonList.length > 0) await processList(seasonList, true);

    return results;
}

async function injectedFetchPriceDrops() {
    const csrf = document.querySelector("input[name='_csrf']")?.value;
    if (!csrf) return { error: true };

    const apiUrl = '/product/schedule/prdPrcShortList.json'; 
    const metaDetailApiUrl = '/meta/contentsMetaRelation.json';

    const today = new Date();
    today.setHours(0,0,0,0); 

    const past1Year = new Date(today);
    past1Year.setFullYear(today.getFullYear() - 1);
    
    const maxDate = new Date(today);
    maxDate.setDate(today.getDate() + 28);

    const fDateStr = (d) => d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    const fDateDash = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
    
    const tmpStartDt = fDateDash(past1Year);
    const tmpEndDt = fDateDash(maxDate);
    const apiStartDt = fDateStr(past1Year) + "000000"; 
    const apiEndDt = fDateStr(maxDate) + "235959";

    const priceDropStart = fDateStr(today);
    const priceDropEnd = fDateStr(maxDate);

    const targetPocs = [{ code: "10", name: "TV" }];
    const targetMetaCodes = ["200", "C136", "100", "C135"];

    const getVodType = (rentPrice) => {
        const rent = parseInt(rentPrice) || 0;
        if (rent > 10000) return "PVOD";
        if (rent === 10000) return "SPVOD";
        if (rent >= 7000 && rent < 10000) return "EPVOD";
        if (rent >= 5000 && rent < 7000) return "RVOD";
        if (rent > 0 && rent < 5000) return "Library";
        if (rent === 0) return "SVOD";
        return "기타";
    };

    const formatPrice = (price) => {
        if (!price || price === "0") return "만료";
        return parseInt(price).toLocaleString() + "원";
    };

    let rawDrops = [];
    const uniqueLogs = new Set(); 

    for (const metaCode of targetMetaCodes) {
        for (const poc of targetPocs) {
            let page = 1;
            let isLastPage = false;

            while (!isLastPage) {
                const payload = {
                    epsdTypCd: "20", initTag: "N", pocTypCd: poc.code, cpDiv: "COMMON",
                    contrpId: "", contrpTyp: "COMMON", metaCd: metaCode, 
                    tmpSvcDtStart: tmpStartDt, tmpSvcDtEnd: tmpEndDt,
                    svcDtStart: apiStartDt, svcDtEnd: apiEndDt,
                    srisId: "", epsdId: "", rsluTypCd: "", _csrf: csrf,
                    curPage: page, size: 1000, rows: 1000, page: page, sord: "DESC", sidx: "", _search: "false"
                };

                try {
                    const response = await $.post(apiUrl, payload);
                    const list = response.result?.contents || response.contents || [];
                    if (list.length < 1000 || list.length === 0) isLastPage = true;

                    for (const item of list) {
                        let schedules = [];
                        for (let i = 1; i <= 10; i++) {
                            if (item[`A_${i}_null_frDy`]) {
                                schedules.push({
                                    frDy: item[`A_${i}_null_frDy`].substring(0, 8),
                                    rentPrice: item[`A_${i}_null_amtN`] || "0",
                                    ownPrice: item[`A_${i}_null_amtY`] || "0"
                                });
                            }
                        }
                        schedules.sort((a, b) => a.frDy.localeCompare(b.frDy));

                        for (let i = 0; i < schedules.length; i++) {
                            let current = schedules[i];
                            
                            if (current.frDy >= priceDropStart && current.frDy <= priceDropEnd) {
                                let prev = i > 0 ? schedules[i-1] : { rentPrice: "-", ownPrice: "-" };

                                if (prev.rentPrice === current.rentPrice && prev.ownPrice === current.ownPrice) continue;

                                let formattedDate = `${current.frDy.substring(0,4)}.${current.frDy.substring(4,6)}.${current.frDy.substring(6,8)}`;
                                const title = item.srisNm || item.epsdNm;
                                const rslu = item.rsluTypNm || '미상';
                                const srisId = item.srisId || item.sris_id;
                                
                                const uniqueKey = `${title}_${rslu}_${current.frDy}_${current.rentPrice}`;
                                if (!uniqueLogs.has(uniqueKey)) {
                                    uniqueLogs.add(uniqueKey);
                                    
                                    let targetDate = new Date(current.frDy.substring(0,4), parseInt(current.frDy.substring(4,6))-1, current.frDy.substring(6,8));
                                    let daysDiff = Math.floor((targetDate - today) / (1000*60*60*24));

                                    rawDrops.push({
                                        pocName: poc.name,
                                        metaCode: metaCode,
                                        title: title,
                                        rslu: rslu,
                                        srisId: srisId,
                                        daysDiff: daysDiff,
                                        formattedDate: formattedDate,
                                        rawTargetRentPrice: parseInt(current.rentPrice) || 0,
                                        rentChange: `${formatPrice(prev.rentPrice)} ➡️ ${formatPrice(current.rentPrice)}`,
                                        ownChange: `${formatPrice(prev.ownPrice)} ➡️ ${formatPrice(current.ownPrice)}`,
                                        libChange: `${getVodType(prev.rentPrice)} ➡️ ${getVodType(current.rentPrice)}`
                                    });
                                }
                            }
                        }
                    }
                    page++; 
                } catch (error) {
                    isLastPage = true; 
                }
            }
        }
    }

    let uniqueSrisIds = [...new Set(rawDrops.map(d => d.srisId))];
    let metaDataMap = {};

    const CHUNK_SIZE = 15; 
    for (let i = 0; i < uniqueSrisIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueSrisIds.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (sId) => {
            let extractedMetaId = "";
            let audienceCount = 0;
            try {
                let d = await $.post('/contents/title/titleSelect.json', { srisId: sId, _csrf: csrf });
                extractedMetaId = d?.result?.titleInfo?.metaId || d?.titleInfo?.metaId || d?.result?.metaId || d?.metaId || "";
                
                if (extractedMetaId) {
                    let m = await $.post(metaDetailApiUrl, { metaId: extractedMetaId, _csrf: csrf });
                    let foundAud = m?.result?.metaInfo?.dmstSpctCnt || m?.metaInfo?.dmstSpctCnt;
                    audienceCount = parseInt(foundAud) || 0; 
                }
            } catch(e) {}
            
            metaDataMap[sId] = { extractedMetaId, audienceCount };
        }));
    }

    let extractedData = rawDrops.map(item => {
        let meta = metaDataMap[item.srisId] || { audienceCount: 0 };
        return {
            ...item,
            rawAudience: meta.audienceCount,
            audienceText: meta.audienceCount > 0 ? meta.audienceCount.toLocaleString() + "명" : "정보 없음"
        };
    });
    
    extractedData.sort((a, b) => a.daysDiff - b.daysDiff);
    return extractedData;
}


// ==========================================
// 🚀 신규 기능: 기간 설정 기반 엑셀 추출 로직
// ==========================================
document.getElementById('runExcelBtn')?.addEventListener('click', () => {
    let startVal = document.getElementById('exStartDt').value;
    let endVal = document.getElementById('exEndDt').value;

    if (!startVal || !endVal) return alert("시작일과 종료일을 모두 설정해주세요.");

    let startDt = startVal.replace(/-/g, '');
    let endDt = endVal.replace(/-/g, '');
    if (startDt > endDt) return alert("시작일이 종료일보다 늦을 수 없습니다.");

    const statusEl = document.getElementById('excelStatus');
    const btn = document.getElementById('runExcelBtn');
    
    statusEl.innerText = "📡 대상 리스트를 검색하고 상세 데이터를 파싱 중입니다... (1~2분 소요)";
    btn.disabled = true;
    btn.style.opacity = '0.5';

    injectScript(injectedDateRangeExport, [startDt, endDt], (result) => {
        btn.disabled = false;
        btn.style.opacity = '1';

        if (!result || result.error) {
            statusEl.innerText = "";
            return alert(`오류 발생: ${result?.msg || '알 수 없는 오류'}`);
        }
        if (result.count === 0) {
            statusEl.innerText = "해당 기간에 편성된 타이틀이 없습니다.";
            return;
        }

        statusEl.innerText = `✅ 총 ${result.count}건 파싱 완료!`;
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = result.data;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        
        try {
            document.execCommand('copy');
            alert(`🎉 총 ${result.count}건 복사 완료!\n구글 시트에 [Ctrl + V]로 붙여넣으세요.`);
        } catch (err) {
            alert(`복사 실패: ${err}`);
        } finally {
            document.body.removeChild(tempTextArea);
        }
    });
});

async function injectedDateRangeExport(startDt, endDt) {
    const csrf = document.querySelector("input[name='_csrf']")?.value;
    if (!csrf) return { error: true, msg: "CSRF 토큰 누락" };

    try {
        let tRes = await $.post('/contents/title/titleList.json', { schSvcFrDt: startDt, schSvcToDt: endDt, rows: 1000, page: 1, _csrf: csrf }).catch(()=>({}));
        let sRes = await $.post('/contents/season/seasonList.json', { schSvcFrDt: startDt, schSvcToDt: endDt, rows: 1000, page: 1, _csrf: csrf }).catch(()=>({}));
        
        let tList = tRes.result?.contents || tRes.contents || [];
        let sList = sRes.result?.contents || sRes.contents || [];

        let approvedList = [...tList, ...sList].filter(item => {
            let tvStatus = item.tvStatus || item.tv_status || "";
            let tvMdaStatus = item.tvMdaStatus || item.tv_mda_status || "";
            return tvStatus.includes("배포승인") || tvMdaStatus.includes("배포승인");
        });
        
        let targetSrisIds = [...new Set([...tList, ...sList].map(item => item.srisId || item.sris_id).filter(id => id))];
        
        if (targetSrisIds.length === 0) return { data: "", count: 0 };

        let tsvOutput = "카테고리구분_메타\t서브카테고리구분(메타)\t시리즈ID\t콘텐츠메타유형\t계약처명(시리즈)\t시리즈유형\t영상유형\t서비스시작일시\tPPV판매가격\t콘텐츠상품명\tN스크린여부\t월정액상품명\n";
        
        const today = new Date();
        const todayStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');

        const findValueDeep = (obj, targetKeys) => {
            let result = null;
            const keys = Array.isArray(targetKeys) ? targetKeys : [targetKeys];
            const search = (curr) => {
                if (result !== null || curr === null || typeof curr !== 'object') return;
                for (let k in curr) {
                    if (keys.includes(k) && curr[k] !== undefined && curr[k] !== null && curr[k] !== "") { 
                        result = curr[k]; return; 
                    }
                    if (typeof curr[k] === 'object') search(curr[k]);
                }
            };
            search(obj);
            return result;
        };

        for (const srisId of targetSrisIds) {
            try {
                let detail = await $.post('/contents/season/seasonSelect.json', { srisId, _csrf: csrf }).catch(()=>null);
                let isSeason = !!(detail?.result?.seasonInfo?.metaTypNm || detail?.seasonInfo?.metaTypNm);
                if (!isSeason) detail = await $.post('/contents/title/titleSelect.json', { srisId, _csrf: csrf }).catch(()=>null);
                
                const seriesType = isSeason ? "시즌" : "본편";
                let srisNm = findValueDeep(detail, ["srisNm", "sris_nm"]) || "-";
                let metaId = findValueDeep(detail, ["metaId", "meta_id"]) || "";
                let rawSvcFrDt = String(findValueDeep(detail, ["svcFrDt", "svc_fr_dt"]) || "");
                let svcFrDt = rawSvcFrDt.length >= 8 ? `${rawSvcFrDt.substring(0,4)}-${rawSvcFrDt.substring(4,6)}-${rawSvcFrDt.substring(6,8)}` : rawSvcFrDt;

                let targetEpsdIds = [];
                let epRes = await $.post('/contents/episode/episodeList.json', { srisId, _csrf: csrf, rows: 200, page: 1 }).catch(()=>({}));
                let epList = epRes?.result?.contents || epRes?.contents || [];
                let metaTypNm = "-", svcTypNm = "-";

                if (epList.length > 0) {
                    metaTypNm = epList[0].metaTypNm || epList[0].meta_typ_nm || "-";
                    svcTypNm = epList[0].svcTypNm || epList[0].svc_typ_nm || "-";
                    let mainEps = epList.filter(e => e.pcimTypCd === "10" || String(e.epsdTypNm).includes("본편") || String(e.epsdTypNm).includes("영화"));
                    if (mainEps.length === 0) mainEps = epList;
                    mainEps.sort((a, b) => parseInt(a.brcastTmsVal || 999) - parseInt(b.brcastTmsVal || 999));
                    targetEpsdIds = mainEps.slice(0, 3).map(e => e.epsdId);
                }

                if (targetEpsdIds.length === 0) {
                    let fallbackEp = findValueDeep(detail, ["epsdId", "epsd_id", "mainEpsdId"]);
                    if (fallbackEp) targetEpsdIds.push(fallbackEp);
                }

                let cpNm = "-";
                let cpRes = await $.post('/common/contents/layer/pocContractList.json', { srisId: srisId, pocTypCd: "10", _csrf: csrf }).catch(()=>null);
                let cpList = cpRes?.result?.contents || cpRes?.contents || [];
                if (cpList.length === 0 && targetEpsdIds.length > 0) {
                    cpRes = await $.post('/common/contents/layer/pocContractList.json', { epsdId: targetEpsdIds[0], pocTypCd: "10", _csrf: csrf }).catch(()=>null);
                    cpList = cpRes?.result?.contents || cpRes?.contents || [];
                }
                if (cpList.length > 0) cpNm = [...new Set(cpList.map(c => c.contrpNm))].join(", ");
                else cpNm = findValueDeep(detail, ["cpNm", "cp_nm", "ptnrNm", "cnptNm"]) || "-";

                let nscrnYn = "-";
                if (targetEpsdIds.length > 0) {
                    let epDetail = await $.post('/contents/episode/episodeSelect.json', { epsdId: targetEpsdIds[0], _csrf: csrf }).catch(()=>null);
                    nscrnYn = findValueDeep(epDetail, ["nscrnYn", "nscrn_yn"]) || "-";
                    if (metaId === "") metaId = findValueDeep(epDetail, ["metaId", "meta_id"]) || "";
                    if (metaTypNm === "-") metaTypNm = findValueDeep(epDetail, ["metaTypNm", "meta_typ_nm"]) || "-";
                    if (svcTypNm === "-") svcTypNm = findValueDeep(epDetail, ["svcTypNm", "svc_typ_nm"]) || "-";
                }
                if(metaTypNm === "-") metaTypNm = findValueDeep(detail, ["metaTypNm", "meta_typ_nm"]) || "-";
                if(svcTypNm === "-") svcTypNm = findValueDeep(detail, ["svcTypNm", "svc_typ_nm"]) || "-";
                if(nscrnYn === "-") nscrnYn = findValueDeep(detail, ["nscrnYn", "nscrn_yn"]) || "-";

                let parCdNm = "-", catCdNm = "-";
                if (metaId) {
                    let relRes = await $.post('/meta/contentsMetaRelation.json', { metaId, _csrf: csrf }).catch(()=>null);
                    let catArr = relRes?.result?.metaCatCdInfo || relRes?.metaCatCdInfo || [];
                    if (catArr.length > 0) {
                        parCdNm = catArr[0].parCdNm || "-";
                        catCdNm = catArr[0].catCdNm || "-";
                    }
                }

                let priceSet = new Set(), ppmSet = new Set(); 
                for (let epsdId of targetEpsdIds) {
                    let ppvRes = await $.post('/common/product/layer/ppvPrdList.json', { epsdId, _csrf: csrf, rows: 50, page: 1 }).catch(()=>null);
                    let ppvList = (ppvRes?.result?.contents || ppvRes?.contents || []).filter(p => {
                        if (JSON.stringify(p).toUpperCase().includes("HEB")) return false;
                        let pocVal = p.pocTypCd || p.poc_typ_cd;
                        if (pocVal && String(pocVal) !== "10") return false;
                        let useStatus = p.useYn || p.prdUseYn || p.epsdPrdUseYn || "Y";
                        if (String(useStatus).toUpperCase() === "N") return false;
                        let endDate = p.prdPrcToDt || p.prcToDt || p.epsdPrdToDt || p.prdToDt || p.sellToDt || "";
                        if (endDate.length >= 8 && endDate.substring(0, 8) < todayStr) return false;
                        return true;
                    });
                    
                    if (ppvList.length > 0) ppvList.forEach(p => priceSet.add(p.prdPrice || p.prdPrc || "0"));
                    else priceSet.add("0"); 

                    let ppmRes = await $.post('/common/product/layer/ppmPrdList.json', { epsdId, _csrf: csrf, rows: 100, page: 1 }).catch(()=>null);
                    let ppmList = (ppmRes?.result?.contents || ppmRes?.contents || []).filter(p => {
                        let pocVal = p.pocTypCd || p.poc_typ_cd;
                        if (pocVal && String(pocVal) !== "10") return false;
                        let useStatus = p.useYn || p.prdUseYn || p.epsdPrdUseYn || "Y";
                        if (String(useStatus).toUpperCase() === "N") return false;
                        let endDate = p.prdPrcToDt || p.prcToDt || p.epsdPrdToDt || p.prdToDt || p.sellToDt || "";
                        if (endDate.length >= 8 && endDate.substring(0, 8) < todayStr) return false;
                        return true;
                    });
                    if (ppmList.length > 0) ppmList.forEach(p => ppmSet.add(p.prdNm || p.prd_nm));
                }

                if (priceSet.size === 0) priceSet.add("-");
                let ppmString = ppmSet.size > 0 ? Array.from(ppmSet).join(", ") : "-";

                priceSet.forEach(price => {
                    tsvOutput += [
                        parCdNm, catCdNm, srisId, metaTypNm, cpNm, seriesType, svcTypNm,
                        svcFrDt, price, srisNm, nscrnYn, ppmString
                    ].join("\t") + "\n";
                });
            } catch (err) {}
        }
        return { data: tsvOutput, count: targetSrisIds.length };
    } catch (e) {
        return { error: true, msg: e.message };
    }
}
