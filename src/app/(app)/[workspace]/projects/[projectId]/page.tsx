import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ workspace: string; projectId: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { workspace, projectId } = await params
  redirect(`/${workspace}/projects/${projectId}/tasks`)
}
