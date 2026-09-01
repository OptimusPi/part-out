import { createFileRoute } from "@tanstack/react-router";
import { Workshop } from "@/components/workshop/workshop";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Workshop />;
}
