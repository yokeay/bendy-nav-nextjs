import { notFound, redirect } from "next/navigation";
import { readSession } from "@/server/auth/middleware";
import { getSubmission } from "@/server/cards/submission-service";
import { CardEditorForm } from "../../_components/card-editor-form";
import styles from "../../cards.module.css";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCardSubmissionPage({ params }: Props) {
  const session = await readSession();
  if (!session) redirect("/");
  const { id } = await params;

  const submission = await getSubmission(id);
  if (!submission) notFound();

  const isAdmin = session.role === "admin" || session.role === "superadmin";
  if (submission.authorId !== session.sub && !isAdmin) {
    redirect("/cards/my");
  }

  const readonly = !["draft", "submitted", "reviewing", "rejected"].includes(submission.status);

  return (
    <>
      <h1 className={styles.pageTitle}>编辑提交 #{submission.slug}</h1>
      <p className={styles.pageHint}>
        当前状态：{submission.status}。
        {submission.rejectReason ? ` 审核驳回原因：${submission.rejectReason}` : ""}
        {readonly ? " 该提交已定稿，无法编辑。请返回「我的提交」查看。" : ""}
      </p>
      {!readonly ? (
        <CardEditorForm
          mode="edit"
          initial={{
            id: submission.id,
            slug: submission.slug,
            name: submission.name,
            nameEn: submission.nameEn,
            tips: submission.tips,
            description: submission.description,
            icon: submission.icon,
            coverUrl: submission.coverUrl,
            host: submission.host,
            entryUrl: submission.entryUrl,
            size: (submission.size as "1x1" | "1x2" | "2x2" | "2x4") ?? "2x4",
            resizable: submission.resizable,
            permissions: submission.permissions,
            sandbox: submission.sandbox,
            inlineSource: submission.inlineSource,
            tags: submission.tags,
            version: submission.version,
            changelog: submission.changelog,
            authorName: submission.authorName,
            authorContact: submission.authorContact
          }}
        />
      ) : null}
    </>
  );
}
