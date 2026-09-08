import { useEffect, useMemo, useState } from "react";
import { Plus, Check, X, Clock, CheckCircle, XCircle, Trash, Eye } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, EntityForm, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type AuditStatus = "pending" | "approved" | "rejected";

type PurchaseItem = {
  name: string;
  spec: string;
  quantity: number;
  unitPrice: number;
};

type PurchaseRequest = {
  id: string;
  title: string;
  requester: string;
  items: PurchaseItem[];
  totalAmount: number;
  notes: string;
  status: AuditStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewComment?: string;
};

const STORAGE_KEY = "sock-erp-purchase-audits";

const STATUS_META: Record<AuditStatus, { label: string; tone: string; icon: any }> = {
  pending: { label: "待审核", tone: "warning", icon: Clock },
  approved: { label: "已通过", tone: "success", icon: CheckCircle },
  rejected: { label: "已驳回", tone: "danger", icon: XCircle },
};

function readRequests(): PurchaseRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRequests(list: PurchaseRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function genId() {
  return `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function PurchaseAuditPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<PurchaseRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<AuditStatus | "all">("all");
  const [detailTarget, setDetailTarget] = useState<PurchaseRequest | null>(null);
  // 动态物品行
  const [formItems, setFormItems] = useState<PurchaseItem[]>([{ name: "", spec: "", quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    setRequests(readRequests());
  }, []);

  const filtered = useMemo(() => {
    const list = statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter);
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, statusFilter]);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved");
    const rejected = requests.filter((r) => r.status === "rejected").length;
    const approvedAmount = approved.reduce((s, r) => s + r.totalAmount, 0);
    return { pending, approved: approved.length, rejected, approvedAmount, total: requests.length };
  }, [requests]);

  function openAdd() {
    setFormItems([{ name: "", spec: "", quantity: 1, unitPrice: 0 }]);
    setModalOpen(true);
  }

  function addItemRow() {
    setFormItems([...formItems, { name: "", spec: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItemRow(idx: number) {
    setFormItems(formItems.filter((_, i) => i !== idx));
  }

  function updateItemRow(idx: number, field: keyof PurchaseItem, value: string | number) {
    const updated = [...formItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormItems(updated);
  }

  const formTotal = useMemo(() => {
    return formItems.reduce((s, item) => s + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  }, [formItems]);

  async function handleSubmit(values: Record<string, any>) {
    const validItems = formItems.filter((item) => item.name.trim());
    if (validItems.length === 0) return;
    const total = validItems.reduce((s, item) => s + item.quantity * item.unitPrice, 0);
    const list = [...requests];
    list.push({
      id: genId(),
      title: String(values.title).trim(),
      requester: String(values.requester ?? "").trim(),
      items: validItems,
      totalAmount: total,
      notes: String(values.notes ?? "").trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    writeRequests(list);
    setRequests(list);
    setModalOpen(false);
  }

  function openReview(req: PurchaseRequest, action: "approve" | "reject") {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewComment("");
    setReviewer("");
    setReviewModalOpen(true);
  }

  function confirmReview() {
    if (!reviewTarget) return;
    const list = requests.map((r) => {
      if (r.id === reviewTarget.id) {
        return {
          ...r,
          status: reviewAction === "approve" ? "approved" as AuditStatus : "rejected" as AuditStatus,
          reviewedAt: new Date().toISOString(),
          reviewer: reviewer.trim() || "管理员",
          reviewComment: reviewComment.trim(),
        };
      }
      return r;
    });
    writeRequests(list);
    setRequests(list);
    setReviewModalOpen(false);
    setReviewTarget(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const list = requests.filter((r) => r.id !== deleteTarget.id);
    writeRequests(list);
    setRequests(list);
    setDeleteTarget(null);
  }

  const fields = [
    { name: "title", label: "采购单标题", type: "text" as const, required: true, placeholder: "如：9月原材料采购" },
    { name: "requester", label: "申请人", type: "text" as const, placeholder: "申请人姓名" },
    { name: "notes", label: "备注", type: "textarea" as const, placeholder: "可选" },
  ];

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="entertainment" />}
        eyebrow="审批流程"
        title="采购审核"
        description="采购申请提交、审核与审批记录管理。"
        actions={<Button onClick={openAdd}><Plus size={17} />新建采购申请</Button>}
      />

      <div className="audit-stats">
        <div className="stat-card glass-clear">
          <div className="stat-icon" style={{ background: "#f5a623" }}><Clock size={20} /></div>
          <div><div className="stat-value">{stats.pending}</div><div className="stat-label">待审核</div></div>
        </div>
        <div className="stat-card glass-clear">
          <div className="stat-icon" style={{ background: "#30a46c" }}><CheckCircle size={20} /></div>
          <div><div className="stat-value">{stats.approved}</div><div className="stat-label">已通过</div></div>
        </div>
        <div className="stat-card glass-clear">
          <div className="stat-icon" style={{ background: "#e5484d" }}><XCircle size={20} /></div>
          <div><div className="stat-value">{stats.rejected}</div><div className="stat-label">已驳回</div></div>
        </div>
        <div className="stat-card glass-clear">
          <div className="stat-icon" style={{ background: "var(--accent)" }}>¥</div>
          <div><div className="stat-value">¥{stats.approvedAmount.toFixed(2)}</div><div className="stat-label">已通过金额</div></div>
        </div>
      </div>

      <Section title="采购申请列表" description={`共 ${filtered.length} 条`}>
        <div className="level-filters" style={{ marginBottom: 16 }}>
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              className={statusFilter === s ? "level-filter active" : "level-filter"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "全部" : STATUS_META[s].label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="暂无采购申请" description="点击右上角新建采购申请，或调整筛选条件。" />
        ) : (
          <div className="audit-list">
            {filtered.map((req) => {
              const meta = STATUS_META[req.status];
              const Icon = meta.icon;
              return (
                <div key={req.id} className="audit-item glass-clear">
                  <div className="audit-item-header">
                    <div className="audit-item-title">
                      <span className="audit-title-text">{req.title}</span>
                      <Badge tone={meta.tone as any}><Icon size={13} />{meta.label}</Badge>
                    </div>
                    <div className="audit-item-amount">¥{req.totalAmount.toFixed(2)}</div>
                  </div>
                  <div className="audit-item-meta">
                    <span>申请人：{req.requester || "-"}</span>
                    <span>物品：{req.items.length} 项</span>
                    <span>申请时间：{new Date(req.createdAt).toLocaleDateString("zh-CN")}</span>
                    {req.reviewer ? <span>审核人：{req.reviewer}</span> : null}
                  </div>
                  {req.reviewComment ? (
                    <div className="audit-comment">审核意见：{req.reviewComment}</div>
                  ) : null}
                  <div className="audit-item-actions">
                    <button className="icon-btn" onClick={() => setDetailTarget(req)} aria-label="查看详情"><Eye size={15} /></button>
                    {req.status === "pending" ? (
                      <>
                        <button className="audit-btn approve" onClick={() => openReview(req, "approve")}><Check size={15} />通过</button>
                        <button className="audit-btn reject" onClick={() => openReview(req, "reject")}><X size={15} />驳回</button>
                      </>
                    ) : null}
                    <button className="icon-btn danger" onClick={() => setDeleteTarget(req)} aria-label="删除"><Trash size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 新建采购申请弹窗 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="新建采购申请"
        description="填写采购信息，添加采购物品明细。"
        wide
      >
        <div className="audit-form">
          <div className="form-grid">
            <label className="form-field">
              <span>采购单标题<em>必填</em></span>
              <input id="audit-title" type="text" placeholder="如：9月原材料采购" />
            </label>
            <label className="form-field">
              <span>申请人</span>
              <input id="audit-requester" type="text" placeholder="申请人姓名" />
            </label>
            <label className="form-field form-field-wide">
              <span>备注</span>
              <textarea id="audit-notes" rows={2} placeholder="可选" />
            </label>
          </div>

          <div className="audit-items-section">
            <div className="audit-items-header">
              <span>采购物品明细</span>
              <button type="button" className="button button-ghost button-sm" onClick={addItemRow}><Plus size={14} />添加物品</button>
            </div>
            {formItems.map((item, idx) => (
              <div key={idx} className="audit-item-row">
                <input type="text" placeholder="物品名称" value={item.name} onChange={(e) => updateItemRow(idx, "name", e.target.value)} />
                <input type="text" placeholder="规格" value={item.spec} onChange={(e) => updateItemRow(idx, "spec", e.target.value)} />
                <input type="number" placeholder="数量" value={item.quantity} min={0} onChange={(e) => updateItemRow(idx, "quantity", Number(e.target.value))} />
                <input type="number" placeholder="单价" value={item.unitPrice} min={0} step="0.01" onChange={(e) => updateItemRow(idx, "unitPrice", Number(e.target.value))} />
                <span className="audit-row-total">¥{(item.quantity * item.unitPrice).toFixed(2)}</span>
                {formItems.length > 1 ? (
                  <button type="button" className="icon-btn danger" onClick={() => removeItemRow(idx)} aria-label="删除行"><Trash size={14} /></button>
                ) : <span style={{ width: 34 }} />}
              </div>
            ))}
            <div className="audit-form-total">合计：<strong>¥{formTotal.toFixed(2)}</strong></div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button button-ghost button-md" onClick={() => setModalOpen(false)}>取消</button>
            <button type="button" className="button button-primary button-md" onClick={() => {
              const title = (document.getElementById("audit-title") as HTMLInputElement)?.value || "";
              const requester = (document.getElementById("audit-requester") as HTMLInputElement)?.value || "";
              const notes = (document.getElementById("audit-notes") as HTMLTextAreaElement)?.value || "";
              handleSubmit({ title, requester, notes });
            }}>提交申请</button>
          </div>
        </div>
      </Modal>

      {/* 审核弹窗 */}
      <Modal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title={reviewAction === "approve" ? "审核通过" : "审核驳回"}
        description={reviewTarget ? `采购单：${reviewTarget.title}（¥${reviewTarget.totalAmount.toFixed(2)}）` : ""}
      >
        <div className="audit-review-form">
          <label className="form-field">
            <span>审核人</span>
            <input type="text" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="审核人姓名" />
          </label>
          <label className="form-field">
            <span>审核意见</span>
            <textarea rows={3} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="可选，填写审核意见" />
          </label>
          <div className="modal-actions">
            <button type="button" className="button button-ghost button-md" onClick={() => setReviewModalOpen(false)}>取消</button>
            <button
              type="button"
              className={reviewAction === "approve" ? "button button-primary button-md" : "button button-danger button-md"}
              onClick={confirmReview}
            >
              {reviewAction === "approve" ? "确认通过" : "确认驳回"}
            </button>
          </div>
        </div>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        open={detailTarget !== null}
        onClose={() => setDetailTarget(null)}
        title="采购申请详情"
        description={detailTarget ? detailTarget.title : ""}
        wide
      >
        {detailTarget ? (
          <div className="audit-detail">
            <div className="audit-detail-meta">
              <p><strong>申请人：</strong>{detailTarget.requester || "-"}</p>
              <p><strong>状态：</strong><Badge tone={STATUS_META[detailTarget.status].tone as any}>{STATUS_META[detailTarget.status].label}</Badge></p>
              <p><strong>申请时间：</strong>{new Date(detailTarget.createdAt).toLocaleString("zh-CN")}</p>
              {detailTarget.reviewer ? <p><strong>审核人：</strong>{detailTarget.reviewer}</p> : null}
              {detailTarget.reviewedAt ? <p><strong>审核时间：</strong>{new Date(detailTarget.reviewedAt).toLocaleString("zh-CN")}</p> : null}
              {detailTarget.reviewComment ? <p><strong>审核意见：</strong>{detailTarget.reviewComment}</p> : null}
              {detailTarget.notes ? <p><strong>备注：</strong>{detailTarget.notes}</p> : null}
            </div>
            <table className="member-table">
              <thead>
                <tr><th>物品名称</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th></tr>
              </thead>
              <tbody>
                {detailTarget.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>{item.spec || "-"}</td>
                    <td>{item.quantity}</td>
                    <td>¥{item.unitPrice.toFixed(2)}</td>
                    <td>¥{(item.quantity * item.unitPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>合计</td><td style={{ fontWeight: 700 }}>¥{detailTarget.totalAmount.toFixed(2)}</td></tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除采购申请"
        description={`确定要删除「${deleteTarget?.title}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
