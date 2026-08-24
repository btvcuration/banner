if (!document.getElementById('ncms-hub-floating')) {
    const wrapper = document.createElement('div');
    wrapper.id = 'ncms-hub-floating';
    
    wrapper.style.position = 'fixed';
    wrapper.style.bottom = '20px';
    wrapper.style.right = '20px';
    wrapper.style.zIndex = '2147483647'; 
    wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    wrapper.style.borderRadius = '12px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.background = '#1a1d29';
    wrapper.style.border = '1px solid #374151';

    const topBar = document.createElement('div');
    topBar.style.height = '40px';
    topBar.style.background = '#242736';
    topBar.style.display = 'flex';
    topBar.style.alignItems = 'center';
    topBar.style.justifyContent = 'space-between';
    topBar.style.padding = '0 15px';
    topBar.style.borderBottom = '1px solid #374151';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerText = 'NCMS Hub (플로팅)';
    titleSpan.style.color = '#fff';
    titleSpan.style.fontSize = '14px';
    titleSpan.style.fontWeight = 'bold';
    
    const toggleBtn = document.createElement('button');
    toggleBtn.style.border = 'none';
    toggleBtn.style.borderRadius = '4px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.fontSize = '12px';
    toggleBtn.style.padding = '6px 12px';
    toggleBtn.style.fontWeight = 'bold';

    // 사이트 진입 시 기본값을 '최소화' 상태로 설정
    let isMinimized = true; 
    wrapper.style.height = '40px';
    wrapper.style.width = '180px';
    toggleBtn.innerText = '▲ 펼치기';
    toggleBtn.style.background = '#9da0f2';
    toggleBtn.style.color = '#1a1d29';
    titleSpan.style.display = 'none';

    toggleBtn.onclick = () => {
        isMinimized = !isMinimized;
        if (isMinimized) {
            wrapper.style.height = '40px';
            wrapper.style.width = '180px';
            toggleBtn.innerText = '▲ 펼치기';
            toggleBtn.style.background = '#9da0f2';
            toggleBtn.style.color = '#1a1d29';
            titleSpan.style.display = 'none';
        } else {
            wrapper.style.height = '640px';
            wrapper.style.width = '550px';
            toggleBtn.innerText = '▼ 최소화';
            toggleBtn.style.background = '#e15255';
            toggleBtn.style.color = '#fff';
            titleSpan.style.display = 'inline-block';
        }
    };

    topBar.appendChild(titleSpan);
    topBar.appendChild(toggleBtn);

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');
    iframe.style.width = '100%';
    iframe.style.height = 'calc(100% - 40px)';
    iframe.style.border = 'none';
    
    wrapper.appendChild(topBar);
    wrapper.appendChild(iframe);
    document.body.appendChild(wrapper);
} else {
    // 확장 프로그램 아이콘 클릭 시 창을 완전히 숨기거나 띄움
    const wrapper = document.getElementById('ncms-hub-floating');
    wrapper.style.display = wrapper.style.display === 'none' ? 'flex' : 'none';
}