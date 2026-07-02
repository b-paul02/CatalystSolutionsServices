export default function Icon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`ms ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}
