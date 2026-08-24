chrome.action.onClicked.addListener((tab) => {
    // NCMS 사이트이면서 로그인 화면이 아닐 때만 플로팅 UI 주입
    if (tab.url.includes("ncms.skbroadband.com") && !tab.url.includes("/login")) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });
    }
});