import { PageHeader, EmptyState } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  module,
  emptyTitle = "功能建设中",
  emptyDescription = "该模块正在规划开发，当前版本仅保留菜单入口，不影响其他功能使用。",
}: {
  eyebrow: string;
  title: string;
  description: string;
  module: ModuleArtworkName;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <>
      <PageHeader
        icon={<ModuleArtwork module={module} />}
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <EmptyState title={emptyTitle} description={emptyDescription} />
    </>
  );
}
