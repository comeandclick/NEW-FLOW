import { redirect } from 'next/navigation'

export default function SocialRoot({ params }: { params: { ws: string } }) {
  redirect(`/app/${params.ws}/social/accounts`)
}
