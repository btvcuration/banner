import React, { useState, useEffect } from 'react';

// 💡 방금 발급받으신 Cloudflare Worker URL을 여기에 연결합니다.
const API_URL = "https://royal-flower-ea31.alcheminos.workers.dev/";

function App() {
  const [activeTab, setActiveTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [approved, setApproved] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterBanner, setFilterBanner] = useState('all');

  // 데이터 로드 엔진
  const fetchData = async (action, setData) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}?action=${action}`);
      const json = await response.json();
      setData(json);
    } catch (error) {
      alert(`데이터 로드 실패 (${action}): ` + error.toString());
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'requests') fetchData('getRequests', setRequests);
    if (activeTab === 'approved') fetchData('getApproved', setApproved);
    if (activeTab === 'schedules') fetchData('getSchedules', setSchedules);
  }, [activeTab]);

  // [승인] 버튼 클릭 액션
  const handleApprove = async (reqItem) => {
    if (!window.confirm(`[${reqItem.이벤트명}] 편성을 승인하시겠습니까?`)) return;
    setLoading(true);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approveRequest',
          payload: {
            원본요청ID: reqItem.요청ID,
            상태: '승인완료',
            구분: reqItem.구분,
            이벤트명: reqItem.이벤트명,
            승인시작일: reqItem.요청시작일,
            승인종료일: reqItem.요청종료일,
            편성기간: reqItem.편성기간,
            편성영역: reqItem.편성영역,
            대상채널_상세: reqItem.대상채널_상세,
            담당자: reqItem.담당자,
            배너유형: reqItem.배너유형,
            랜딩유형: reqItem.랜딩유형,
            랜딩세부내용: reqItem.랜딩세부내용,
            대상STB: reqItem.대상STB,
            이미지_Jira링크: reqItem.이미지_Jira링크,
            비고: reqItem.비고
          }
        })
      });
      const result = await response.json();
      if (result.status === 'success') {
        alert('✅ 승인 처리가 완료되었습니다.');
        fetchData('getRequests', setRequests);
      }
    } catch (error) {
      alert('승인 처리 중 오류 발생: ' + error.toString());
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Malgun Gothic, sans-serif' }}>
      {/* 상단 타이틀 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <h2>📺 B tv 실시간 인벤토리 편성 Admin 시스템</h2>
        {loading && <span style={{ color: '#1a73e8', fontWeight: 'bold' }}>🔄 데이터 통신 중...</span>}
      </div>

      {/* 내비게이션 탭 버튼 */}
      <div style={{ margin: '20px 0', display: 'flex', gap: '10px' }}>
        <button onClick={() => setActiveTab('requests')} style={tabStyle(activeTab === 'requests', '#1a73e8')}>📥 신규 요청 관리 ({requests.length})</button>
        <button onClick={() => setActiveTab('approved')} style={tabStyle(activeTab === 'approved', '#34a853')}>📋 승인 마스터 데이터</button>
        <button onClick={() => setActiveTab('schedules')} style={tabStyle(activeTab === 'schedules', '#ea4335')}>📅 일자별 실편성 타임라인</button>
      </div>

      {/* 1. 요청 관리 화면 */}
      {activeTab === 'requests' && (
        <table style={tableStyle}>
          <thead>
            <tr style={{ backgroundColor: '#1a73e8', color: '#fff' }}>
              <th style={thStyle}>요청ID</th><th style={thStyle}>구분</th><th style={thStyle}>이벤트명</th>
              <th style={thStyle}>배너유형</th><th style={thStyle}>편성영역</th><th style={thStyle}>요청기간</th>
              <th style={thStyle}>담당자</th><th style={thStyle}>액션</th>
            </tr>
          </thead>
          <tbody>
            {requests.filter(r => r.상태 === '신규(요청)').map((req) => (
              <tr key={req.요청ID} style={{ textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                <td style={tdStyle}>{req.요청ID}</td>
                <td style={tdStyle}>{req.구분}</td>
                <td style={tdStyle} align="left"><b>{req.이벤트명}</b></td>
                <td style={tdStyle}>{req.배너유형}</td>
                <td style={tdStyle}>{req.편성영역 || '-'}</td>
                <td style={tdStyle}>{req.요청시작일} ~ {req.요청종료일}</td>
                <td style={tdStyle}>{req.담당자}</td>
                <td style={tdStyle}>
                  <button onClick={() => handleApprove(req)} style={btnStyle('#34a853')}>🟢 승인</button>
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#777' }}>대기 중인 신규 편성 요청이 없습니다.</td></tr>}
          </tbody>
        </table>
      )}

      {/* 2. 승인 마스터 화면 */}
      {activeTab === 'approved' && (
        <div>
          <div style={{ marginBottom: '15px' }}>
            <label><b>배너 필터: </b></label>
            <select value={filterBanner} onChange={(e) => setFilterBanner(e.target.value)} style={{ padding: '5px', marginLeft: '5px' }}>
              <option value="all">전체 배너 보기</option>
              <option value="WingUI 배너">WingUI 배너</option>
              <option value="편성표 배너">편성표 배너</option>
            </select>
          </div>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: '#34a853', color: '#fff' }}>
                <th style={thStyle}>승인ID</th><th style={thStyle}>이벤트명</th><th style={thStyle}>배너유형</th>
                <th style={thStyle}>편성영역</th><th style={thStyle}>승인기간</th><th style={thStyle}>랜딩유형</th>
                <th style={thStyle}>담당자</th>
              </tr>
            </thead>
            <tbody>
              {approved.filter(a => filterBanner === 'all' || a.배너유형 === filterBanner).map((app) => (
                <tr key={app.승인ID} style={{ textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                  <td style={tdStyle}>{app.승인ID}</td>
                  <td style={tdStyle} align="left">{app.이벤트명}</td>
                  <td style={tdStyle}>{app.배너유형}</td>
                  <td style={tdStyle}>{app.편성영역}</td>
                  <td style={tdStyle}>{app.승인시작일} ~ {app.승인종료일}</td>
                  <td style={tdStyle}>{app.랜딩유형}</td>
                  <td style={tdStyle}>{app.담당자}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. 일자별 실편성 타임라인 화면 */}
      {activeTab === 'schedules' && (
        <div>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#555' }}>💡 아래 표는 슬롯 분배 알고리즘 및 확정 처리를 통해 매핑된 최종 확정 캘린더 데이터셋입니다.</span>
            <button style={btnStyle('#ea4335', true)}>🤖 자동 편성 분배 로직 실행</button>
          </div>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: '#ea4335', color: '#fff' }}>
                <th style={thStyle}>편성일자</th><th style={thStyle}>배너유형</th><th style={thStyle}>편성영역</th>
                <th style={thStyle}>구분</th><th style={thStyle}>최종 노출 이벤트명</th><th style={thStyle}>랜딩 세부내용</th>
                <th style={thStyle}>UNA확인</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((sch) => (
                <tr key={sch.실편성ID} style={{ textAlign: 'center', borderBottom: '1px solid #ddd', backgroundColor: sch.구분 === '조율편성' ? '#fff2cc' : '#fff' }}>
                  <td style={tdStyle}><b>{sch.편성일자}</b></td>
                  <td style={tdStyle}>{sch.배너유형}</td>
                  <td style={tdStyle}>{sch.편성영역}</td>
                  <td style={tdStyle}>{sch.구분}</td>
                  <td style={tdStyle} align="left">{sch.이벤트명}</td>
                  <td style={tdStyle} align="left">{sch.랜딩세부내용}</td>
                  <td style={tdStyle} style={{ color: sch.UNA편성확인 === '완료' ? 'green' : 'red', fontWeight: 'bold' }}>{sch.UNA편성확인 || '대기'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 간단한 인라인 스타일 정의용 보조 함수들
const tabStyle = (isActive, color) => ({
  padding: '10px 20px', fontSize: '14px', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer',
  backgroundColor: isActive ? color : '#e0e0e0', color: isActive ? '#fff' : '#333', transition: 'all 0.2s'
});
const btnStyle = (color, isLarge = false) => ({
  padding: isLarge ? '10px 20px' : '5px 12px', backgroundColor: color, color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
});
const tableStyle = { width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '14px' };
const thStyle = { padding: '12px', border: '1px solid #ddd' };
const tdStyle = { padding: '10px', border: '1px solid #ddd' };

export default App;
