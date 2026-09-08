import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash, Users, Star, MagnifyingGlass } from "@phosphor-icons/react";
import { PageHeader, Section, Button, Modal, EntityForm, ConfirmDialog, EmptyState, Badge } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type MemberLevel = "普通" | "银卡" | "金卡" | "钻石";

type Member = {
  id: string;
  name: string;
  phone: string;
  level: MemberLevel;
  points: number;
  balance: number;
  joinDate: string;
  notes: string;
};

const STORAGE_KEY = "sock-erp-members";
const LEVELS: MemberLevel[] = ["普通", "银卡", "金卡", "钻石"];
const LEVEL_TONE: Record<MemberLevel, string> = {
  "普通": "neutral",
  "银卡": "accent",
  "金卡": "warning",
  "钻石": "success",
};

function readMembers(): Member[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMembers(list: Member[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function genId() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function MemberPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<MemberLevel | "全部">("全部");

  useEffect(() => {
    setMembers(readMembers());
  }, []);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      const matchSearch = !search || m.name.includes(search) || m.phone.includes(search);
      const matchLevel = levelFilter === "全部" || m.level === levelFilter;
      return matchSearch && matchLevel;
    });
  }, [members, search, levelFilter]);

  const stats = useMemo(() => {
    const totalPoints = members.reduce((s, m) => s + (m.points || 0), 0);
    const totalBalance = members.reduce((s, m) => s + (m.balance || 0), 0);
    return { count: members.length, totalPoints, totalBalance };
  }, [members]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setModalOpen(true);
  }

  async function handleSubmit(values: Record<string, any>) {
    const list = [...members];
    if (editing) {
      const idx = list.findIndex((m) => m.id === editing.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          name: String(values.name).trim(),
          phone: String(values.phone ?? "").trim(),
          level: (values.level as MemberLevel) || "普通",
          points: Number(values.points) || 0,
          balance: Number(values.balance) || 0,
          joinDate: String(values.joinDate || new Date().toISOString().slice(0, 10)),
          notes: String(values.notes ?? "").trim(),
        };
      }
    } else {
      list.push({
        id: genId(),
        name: String(values.name).trim(),
        phone: String(values.phone ?? "").trim(),
        level: (values.level as MemberLevel) || "普通",
        points: Number(values.points) || 0,
        balance: Number(values.balance) || 0,
        joinDate: String(values.joinDate || new Date().toISOString().slice(0, 10)),
        notes: String(values.notes ?? "").trim(),
      });
    }
    writeMembers(list);
    setMembers(list);
    setModalOpen(false);
    setEditing(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const list = members.filter((m) => m.id !== deleteTarget.id);
    writeMembers(list);
    setMembers(list);
    setDeleteTarget(null);
  }

  const fields = [
    { name: "name", label: "会员姓名", type: "text" as const, required: true, placeholder: "如：张三" },
    { name: "phone", label: "联系电话", type: "text" as const, placeholder: "手机号" },
    { name: "level", label: "会员等级", type: "select" as const, options: LEVELS.map((l) => ({ value: l, label: l })) },
    { name: "points", label: "积分", type: "number" as const, placeholder: "0", step: "1" },
    { name: "balance", label: "储值余额(元)", type: "number" as const, placeholder: "0.00", step: "0.01" },
    { name: "joinDate", label: "注册日期", type: "date" as const },
    { name: "notes", label: "备注", type: "textarea" as const, placeholder: "可选" },
  ];

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="settings" />}
        eyebrow="会员体系"
        title="会员管理"
        description="管理客户会员信息、等级、积分与储值余额。"
        actions={<Button onClick={openAdd}><Plus size={17} />添加会员</Button>}
      />

      <div className="member-stats">
        <div className="stat-card glass-clear">
          <div className="stat-icon"><Users size={22} /></div>
          <div><div className="stat-value">{stats.count}</div><div className="stat-label">会员总数</div></div>
        </div>
        <div className="stat-card glass-clear">
          <div className="stat-icon"><Star size={22} /></div>
          <div><div className="stat-value">{stats.totalPoints}</div><div className="stat-label">积分总计</div></div>
        </div>
        <div className="stat-card glass-clear">
          <div className="stat-icon">¥</div>
          <div><div className="stat-value">¥{stats.totalBalance.toFixed(2)}</div><div className="stat-label">储值总额</div></div>
        </div>
      </div>

      <Section title="会员列表" description={`共 ${filtered.length} 位会员`}>
        <div className="member-toolbar">
          <div className="search-box">
            <MagnifyingGlass size={16} />
            <input
              type="text"
              placeholder="搜索姓名或电话..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="level-filters">
            <button
              className={levelFilter === "全部" ? "level-filter active" : "level-filter"}
              onClick={() => setLevelFilter("全部")}
            >全部</button>
            {LEVELS.map((l) => (
              <button
                key={l}
                className={levelFilter === l ? "level-filter active" : "level-filter"}
                onClick={() => setLevelFilter(l)}
              >{l}</button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="暂无会员" description="点击右上角添加会员，或调整筛选条件。" />
        ) : (
          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>电话</th>
                  <th>等级</th>
                  <th>积分</th>
                  <th>余额</th>
                  <th>注册日期</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="member-name-cell">{m.name}</td>
                    <td>{m.phone || "-"}</td>
                    <td><Badge tone={LEVEL_TONE[m.level] as any}>{m.level}</Badge></td>
                    <td>{m.points}</td>
                    <td>¥{(m.balance || 0).toFixed(2)}</td>
                    <td>{m.joinDate || "-"}</td>
                    <td className="member-notes">{m.notes || "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => openEdit(m)} aria-label="编辑"><Pencil size={15} /></button>
                        <button className="icon-btn danger" onClick={() => setDeleteTarget(m)} aria-label="删除"><Trash size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? "编辑会员" : "添加会员"}
        description="填写会员信息，带 * 为必填项。"
        wide
      >
        <EntityForm
          fields={fields}
          initial={editing ? {
            name: editing.name, phone: editing.phone, level: editing.level,
            points: editing.points, balance: editing.balance, joinDate: editing.joinDate, notes: editing.notes,
          } : { level: "普通", points: 0, balance: 0, joinDate: new Date().toISOString().slice(0, 10) }}
          submitLabel={editing ? "保存修改" : "添加会员"}
          onSubmit={handleSubmit}
          onCancel={() => { setModalOpen(false); setEditing(null); }}
        />
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除会员"
        description={`确定要删除会员「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
