import { readSession } from "@/server/auth/middleware";
import { CardEditorForm } from "../_components/card-editor-form";
import styles from "../cards.module.css";

export const dynamic = "force-dynamic";

export default async function CreateCardPage() {
  const session = await readSession();
  return (
    <>
      <h1 className={styles.pageTitle}>提交新卡片</h1>
      <p className={styles.pageHint}>
        卡片提交后会进入审核队列。管理员账户直接提交的卡片将跳过审核直接入库。
      </p>
      <CardEditorForm mode="create" defaultAuthorName={session?.login ?? ""} />
    </>
  );
}
