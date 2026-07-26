/** 調整パネルの見た目（CSS）。TuningPanel.ts が <style> として1度だけ差し込む。 */
export const TUNING_PANEL_CSS = `
.tp-root {
  position: fixed;
  top: 0;
  right: 0;
  width: 440px;
  max-width: 100vw;
  height: 100%;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(12, 16, 24, 0.97);
  border-left: 2px solid #f4f4f4;
  color: #ffffff;
  font-family: system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5);
}

.tp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #6a7180;
}
.tp-title { margin: 0; font-size: 15px; font-weight: 700; color: #ffd24a; }
.tp-subtitle { margin: 2px 0 0; font-size: 11px; color: #9aa3b2; }

.tp-tabs { display: flex; border-bottom: 1px solid #6a7180; }
.tp-tab {
  flex: 1;
  padding: 9px 2px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #9aa3b2;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tp-tab:hover { color: #ffffff; background: rgba(255, 255, 255, 0.05); }
.tp-tab--active { color: #ffd24a; border-bottom-color: #ffd24a; }

.tp-body { flex: 1; overflow-y: auto; padding: 12px 14px 20px; }

.tp-section { margin: 0 0 6px; }
.tp-section:not(:first-child) { margin-top: 20px; }
.tp-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #ffd24a;
  border-bottom: 1px solid #6a7180;
  padding-bottom: 4px;
}
.tp-section-hint { margin: 6px 0 0; font-size: 11px; color: #9aa3b2; }

.tp-row { margin: 12px 0; }
.tp-row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tp-label { font-size: 12px; }
.tp-value { display: inline-flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.tp-unit { font-size: 11px; color: #9aa3b2; }
.tp-hint { margin: 3px 0 0; font-size: 11px; color: #9aa3b2; }

.tp-num, .tp-select {
  background: #10131c;
  border: 1px solid #6a7180;
  border-radius: 3px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  padding: 3px 5px;
}
.tp-num { width: 68px; text-align: right; }
.tp-select { min-width: 120px; }
.tp-num:focus, .tp-select:focus { outline: 1px solid #ffd24a; }

.tp-range { width: 100%; margin: 5px 0 0; accent-color: #ffd24a; }

.tp-check { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.tp-check input { accent-color: #ffd24a; }

.tp-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid #6a7180;
  background: rgba(0, 0, 0, 0.25);
}
.tp-button {
  flex: 1;
  min-width: 96px;
  padding: 7px 8px;
  background: #10131c;
  border: 1px solid #6a7180;
  border-radius: 3px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tp-button:hover { border-color: #f4f4f4; background: #171c28; }
.tp-body .tp-button { width: 100%; margin-top: 6px; }
.tp-button--primary { border-color: #ffd24a; color: #ffd24a; }
.tp-button--danger { border-color: #ff8a8a; color: #ff8a8a; }
.tp-button--close { flex: 0 0 auto; min-width: 0; padding: 5px 10px; }

/* レア度の切り替え（タブの中の小さなタブ） */
.tp-subtabs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
.tp-subtab {
  padding: 5px 9px;
  background: #10131c;
  border: 1px solid #6a7180;
  border-radius: 12px;
  color: #9aa3b2;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.tp-subtab--active { border-color: #ffd24a; color: #ffd24a; }

/* メーターのゾーンのプレビュー */
.tp-meter-preview { display: flex; height: 26px; margin: 10px 0 4px; border: 1px solid #f4f4f4; overflow: hidden; }
.tp-meter-zone { display: flex; align-items: center; justify-content: center; font-size: 10px; color: rgba(0, 0, 0, 0.75); }
.tp-meter-legend { display: flex; justify-content: space-between; font-size: 11px; color: #9aa3b2; }

/* 試し引きの結果表 */
.tp-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
.tp-table th, .tp-table td { padding: 4px 5px; border-bottom: 1px solid #2a2f3a; text-align: right; }
.tp-table th { color: #9aa3b2; font-weight: normal; }
.tp-table th:first-child, .tp-table td:first-child { text-align: left; }
.tp-summary { margin: 10px 0 0; padding: 8px 10px; background: #10131c; border-left: 3px solid #ffd24a; font-size: 12px; }
.tp-warning { color: #ff8a8a; }

.tp-note { margin: 14px 0 0; font-size: 11px; color: #9aa3b2; }
.tp-export { width: 100%; height: 90px; margin-top: 8px; background: #10131c; border: 1px solid #6a7180; color: #ffffff; font-size: 10px; font-family: monospace; }
`;
