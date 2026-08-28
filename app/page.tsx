import { requireChatGPTUser } from "./chatgpt-auth";
import { TrainingApp } from "./training-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");

  return (
    <TrainingApp
      authenticatedUser={{
        email: user.email,
        displayName: user.displayName,
        fullName: user.fullName,
      }}
    />
  );
}
