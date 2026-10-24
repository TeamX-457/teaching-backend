import { createFileRoute } from "@tanstack/react-router";
import { PublicPage } from "@/components/vv/PublicPage";
import { Photo, PHOTOS, type PhotoKey } from "@/components/vv/photos";

export const Route = createFileRoute("/credits")({
  head: () => ({ meta: [{ title: "Photo credits — Voice Verse" }] }),
  component: Credits,
});

// Source: Wikimedia Commons. All files are licensed CC BY-SA 4.0; changes: resized and lightly colour-adjusted.
const CREDITS: { key: PhotoKey; title: string; author: string; page: string }[] = [
  { key: "classroom", title: "Reading Wikipedia in the Classroom for Secondary School Students 59", author: "James Rhoda", page: "https://commons.wikimedia.org/wiki/File:Reading_Wikipedia_in_the_Classroom_for_Secondary_School_Students_59.jpg" },
  { key: "church", title: "Worship section in a church 01", author: "Hadassah Photostorie group", page: "https://commons.wikimedia.org/wiki/File:Worship_section_in_a_church_01.jpg" },
  { key: "conference", title: "Open Data Conference 2017 Lagos Attendees", author: "Adisa471", page: "https://commons.wikimedia.org/wiki/File:Open_Data_Conference_2017_Lagos_Attendees.jpg" },
  { key: "community", title: "Barako (Ogoniland) Village Square Meeting 07", author: "ABORISADEADETONA", page: "https://commons.wikimedia.org/wiki/File:Barako_(Ogoniland)_Village_Square_Meeting_07.jpg" },
  { key: "speaker", title: "Fuji Documentary at Lagos Conference", author: "WheelHelms WS", page: "https://commons.wikimedia.org/wiki/File:Fuji_Documentary_at_Lagos_Conference.jpg" },
];

function Credits() {
  return (
    <PublicPage eyebrow="Credits" title="Photo credits." lead="The photographs on this site are placeholders from Wikimedia Commons, used under the Creative Commons Attribution-ShareAlike 4.0 licence. They will be replaced with our own photography.">
      <ul className="grid gap-5 sm:grid-cols-2">
        {CREDITS.map((c) => (
          <li key={c.key} className="overflow-hidden rounded-2xl border bg-card">
            <div className="aspect-[16/10]"><Photo name={c.key} /></div>
            <div className="p-4 text-sm">
              <p className="font-medium">{c.title}</p>
              <p className="mt-1 text-muted-foreground">
                By {c.author}. <a className="text-primary underline underline-offset-4" href={c.page} target="_blank" rel="noreferrer">Source</a>
                {" · "}<a className="text-primary underline underline-offset-4" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{PHOTOS[c.key].alt}</p>
            </div>
          </li>
        ))}
      </ul>
    </PublicPage>
  );
}
