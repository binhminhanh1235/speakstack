import { useEffect, useState } from 'preact/hooks';
import {
  CORE_TOPICS,
  SpeakPack,
  TEMPLATE_LABELS,
  TemplateType
} from '../../shared/schema';
import { validatePack, ValidationResult } from '../../shared/validator';
import { UserProgressData, idbSaveProgress } from '../lib/storage/idb';
import {
  deletePackUnified,
  safeJsonFetch,
  savePackUnified
} from '../lib/storage/multi-storage';

interface AdminViewProps {
  packs: SpeakPack[];
  progress: UserProgressData;
  onRefreshPacks: () => Promise<void>;
  onSelectPack: (pack: SpeakPack) => void;
}

export function AdminView({
  packs,
  progress,
  onRefreshPacks,
  onSelectPack
}: AdminViewProps) {
  const [editingPackId, setEditingPackId] = useState<string>(packs[0]?.id || '');
  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(packs[0] || {}, null, 2)
  );
  const [validationRes, setValidationRes] = useState<ValidationResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [adminSecret, setAdminSecret] = useState<string>('');

  useEffect(() => {
    const found = packs.find((p) => p.id === editingPackId);
    if (found) {
      setJsonText(JSON.stringify(found, null, 2));
      setValidationRes(null);
    }
  }, [editingPackId]);

  const templates = Object.keys(TEMPLATE_LABELS) as TemplateType[];

  const handleValidateJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const existingIds = new Set(packs.map((p) => p.id));
      const isUpdatingExisting = existingIds.has(parsed.id);
      const res = validatePack(parsed, existingIds, isUpdatingExisting);
      setValidationRes(res);
      setStatusMessage(
        res.valid
          ? `✅ Pack hợp lệ! (${res.warnings.length} cảnh báo)`
          : `❌ Có ${res.errors.length} lỗi cần sửa.`
      );
    } catch (e: any) {
      setStatusMessage(`❌ Lỗi cú pháp JSON: ${e.message}`);
    }
  };

  const handleSaveJson = async () => {
    try {
      const parsed: SpeakPack = JSON.parse(jsonText);
      const existingIds = new Set(packs.map((p) => p.id));
      const isUpdate = existingIds.has(parsed.id);
      const val = validatePack(parsed, existingIds, isUpdate);
      setValidationRes(val);
      if (!val.valid) {
        setStatusMessage(`❌ Không thể lưu: có ${val.errors.length} lỗi validate.`);
        return;
      }

      const res = await savePackUnified(parsed, isUpdate, adminSecret);
      if (res.ok) {
        setStatusMessage(
          `✅ Đã lưu pack "${parsed.id}" và cập nhật index/packs.json nguyên tử!`
        );
        await onRefreshPacks();
      } else {
        setStatusMessage(`❌ Lỗi khi lưu: ${JSON.stringify(res.errors)}`);
      }
    } catch (e: any) {
      setStatusMessage(`❌ Lỗi JSON: ${e.message}`);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!editingPackId) return;
    await deletePackUnified(editingPackId, adminSecret);
    setStatusMessage(`🗑️ Đã xoá pack "${editingPackId}".`);
    await onRefreshPacks();
  };

  const handleReindex = async () => {
    const headers: Record<string, string> = {};
    if (adminSecret) headers['X-Admin-Secret'] = adminSecret;
    const res = await safeJsonFetch<{ ok: boolean; count: number }>('/api/admin/reindex', {
      method: 'POST',
      headers
    });
    if (res?.ok) {
      setStatusMessage(`🔄 Đã dựng lại index/packs.json (${res.count} packs).`);
    } else {
      setStatusMessage('🔄 Đã đồng bộ lại chỉ mục cục bộ (Offline-first).');
    }
    await onRefreshPacks();
  };

  const handleExportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speakstack-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProgress = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await idbSaveProgress(parsed);
        setStatusMessage('✅ Đã nhập dữ liệu tiến độ thành công!');
        await onRefreshPacks();
      } catch {
        setStatusMessage('❌ File tiến độ JSON không hợp lệ.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="admin-container" data-testid="admin-view">
      {/* 1. Coverage Matrix 8 Core Topics x 5 Templates */}
      <section className="admin-section" data-testid="coverage-matrix-section">
        <div className="admin-section-header">
          <div>
            <h2>📊 Ma trận độ phủ (Coverage Matrix: 8 Chủ đề × 5 Templates = 40 Ô)</h2>
            <p>
              MCP tool <code>get_coverage()</code> dùng bảng này để AI agent tự biết ô nào còn trống và sinh pack tiếp theo.
            </p>
          </div>
          <div className="admin-top-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReindex}
              data-testid="reindex-btn"
            >
              🔄 Reindex (index/packs.json)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportProgress}
              data-testid="export-progress-btn"
            >
              📤 Xuất Tiến độ JSON
            </button>
            <label className="btn btn-secondary file-upload-btn">
              📥 Nhập Tiến độ JSON
              <input
                type="file"
                accept="application/json"
                onChange={handleImportProgress}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        <div className="coverage-table-scroll">
          <table className="coverage-table" data-testid="coverage-table">
            <thead>
              <tr>
                <th>Chủ đề (Topic)</th>
                {templates.map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CORE_TOPICS.map((topic) => (
                <tr key={topic.slug}>
                  <td>
                    <strong>{topic.title}</strong>
                    <div className="topic-slug-sub">#{topic.slug}</div>
                  </td>
                  {templates.map((tmpl) => {
                    const matched = packs.filter(
                      (p) => p.topic === topic.slug && p.template === tmpl
                    );
                    return (
                      <td
                        key={tmpl}
                        className={`matrix-cell ${matched.length > 0 ? 'filled' : 'empty'}`}
                      >
                        {matched.length > 0 ? (
                          <div className="cell-packs">
                            {matched.map((mp) => (
                              <button
                                key={mp.id}
                                type="button"
                                className="cell-pack-link"
                                onClick={() => onSelectPack(mp)}
                              >
                                ✓ {mp.id}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="cell-empty-label">Trống (0)</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Pack JSON Editor & Validator */}
      <section className="admin-section">
        <h2>🛠️ Quản lý & Kiểm tra Pack JSON (Shared Validator)</h2>
        {statusMessage && (
          <div className="admin-status-banner" data-testid="admin-status-banner">
            {statusMessage}
          </div>
        )}

        <div className="admin-editor-controls">
          <select
            value={editingPackId}
            onChange={(e: any) => setEditingPackId(e.target.value)}
            aria-label="Chọn pack để sửa"
            data-testid="admin-pack-select"
          >
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.template}] {p.id} (v{p.version})
              </option>
            ))}
          </select>

          <input
            type="password"
            placeholder="Admin/MCP Secret (nếu có)"
            value={adminSecret}
            onInput={(e: any) => setAdminSecret(e.target.value)}
            className="admin-secret-input"
          />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleValidateJson}
            data-testid="validate-json-btn"
          >
            🔍 Validate JSON
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveJson}
            data-testid="save-json-btn"
          >
            💾 Lưu Pack
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDeleteCurrent}
            data-testid="delete-pack-btn"
          >
            🗑️ Xoá Pack
          </button>
        </div>

        <textarea
          className="admin-json-textarea"
          rows={16}
          value={jsonText}
          onInput={(e: any) => setJsonText(e.target.value)}
          aria-label="Nội dung JSON của Pack"
          data-testid="admin-json-textarea"
        />

        {validationRes && (
          <div className="validation-report" data-testid="validation-report">
            <div>
              <strong>Số từ theo tầng:</strong> T1={validationRes.wordCounts.tier1} · T2=
              {validationRes.wordCounts.tier2} · T3={validationRes.wordCounts.tier3}
            </div>
            {validationRes.errors.length > 0 && (
              <ul className="val-errors-list">
                {validationRes.errors.map((err, i) => (
                  <li key={i}>
                    ❌ <strong>[{err.code}]</strong> {err.message}
                  </li>
                ))}
              </ul>
            )}
            {validationRes.warnings.length > 0 && (
              <ul className="val-warnings-list">
                {validationRes.warnings.map((w, i) => (
                  <li key={i}>
                    ⚠️ <strong>[{w.code}]</strong> {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
