export default function SectionHeading({ title }: { title: string }) {
  return (
    <h2
      className="text-2xl font-black mb-6"
      style={{ letterSpacing: "-0.03em" }}
    >
      {title}
    </h2>
  );
}
