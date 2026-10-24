import { cn } from "@/lib/utils";

// Test photographs from Wikimedia Commons (CC BY-SA 4.0). Credits are listed on /credits.
// Replace these files in /public/images when final photography is ready.
export const PHOTOS = {
  classroom: { src: "/images/classroom.jpg", alt: "Students in a Nigerian classroom following a lesson with their teacher" },
  church: { src: "/images/church.jpg", alt: "A worshipper in a Nigerian church, with the congregation behind him" },
  conference: { src: "/images/conference.jpg", alt: "Delegates in a university lecture hall in Lagos" },
  community: { src: "/images/community.jpg", alt: "A community meeting place in Ogoniland, Rivers State" },
  speaker: { src: "/images/speaker.jpg", alt: "A speaker addressing a conference in Lagos" },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

export function Photo({ name, className, priority }: { name: PhotoKey; className?: string; priority?: boolean }) {
  const p = PHOTOS[name];
  return <img src={p.src} alt={p.alt} loading={priority ? "eager" : "lazy"} decoding="async" className={cn("h-full w-full object-cover", className)} />;
}
