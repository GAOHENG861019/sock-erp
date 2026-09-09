import { useState } from "react";
import { Plus, Pencil, Trash } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { Button, ConfirmDialog, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const CLIENT_FIELDS: FieldDefinition[] = [
  { name: "name", label: "客户名称", required: true, placeholder: "如：张三" },
  { name: "phone", label: "联系电话", placeholder: "手机号" },
  { name: "address", label: "地址", placeholder: "可选" },
  { name: "notes", label: "备注", type: "textarea", placeholder: "可选" },
];

export function ConsultingPage() {
  const { data, run } = useWorkspace();
  const clients = data.clients;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Record<string, any> | null>(null);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(client: Record<string, any>) {
    setEditing(client);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSubmit(values: Record<string, any>) {
    const payload = {
      name: String(values.name ?? "").trim(),
      phone: String(values.phone ?? "").trim(),
      address: String(values.address ?? "").trim(),
      notes: String(values.notes ?? "").trim(),
    };
    if (editing) {
      await run(() => api.update("clients", editing.id, payload));
    } else {
      await run(() => api.create("clients", payload));
    }
    closeModal();
  }

  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module="consulting" />}
        eyebrow="客户关系管理"
        title="客户中心"
        description="管理客户档案、联系方式和备注信息。"
        actions={<Button onClick={openAdd}><Plus size={17} />添加客户</Button>}
      />

      <Section title="客户列表" description={`共 ${clients.length} 位客户`}>
        {clients.length === 0 ? (
          <EmptyState
            title="还没有客户记录"
            description="添加客户后，即可在这里查看和管理客户档案。"
            action={<Button onClick={openAdd}>添加第一个客户</Button>}
          />
        ) : (
          <div className="member-table-wrap">
            <table className="member-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>电话</th>
                  <th>地址</th>
                  <th>备注</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td className="member-name-cell">{client.name}</td>
                    <td>{client.phone || "-"}</td>
                    <td>{client.address || "-"}</td>
                    <td className="member-notes">{client.notes || "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn" onClick={() => openEdit(client)} aria-label="编辑"><Pencil size={15} /></button>
                        <button className="icon-btn danger" onClick={() => setDeleteTarget(client)} aria-label="删除"><Trash size={15} /></button>
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
        onClose={closeModal}
        title={editing ? "编辑客户" : "添加客户"}
        description="填写客户信息，带必填标记的为必填项。"
      >
        <EntityForm
          fields={CLIENT_FIELDS}
          initial={editing ? {
            name: editing.name,
            phone: editing.phone ?? "",
            address: editing.address ?? "",
            notes: editing.notes ?? "",
          } : {}}
          submitLabel={editing ? "保存修改" : "添加客户"}
          onSubmit={handleSubmit}
          onCancel={closeModal}
        />
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除客户"
        description={`确定要删除客户「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={async () => {
          if (deleteTarget) await run(() => api.remove("clients", deleteTarget.id));
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
