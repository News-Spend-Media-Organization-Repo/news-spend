export type Section = {
  heading: "New" | "Changed" | "Fixed" | "What to do";
  items: string[];
};

export type Entry = {
  id: string;
  date: string;
  title: string;
  version?: string;
  sections: Section[];
  link?: { label: string; href: string };
};
