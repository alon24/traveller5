export default function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      {Icon && <Icon size={40} className="text-gray-600" />}
      <p className="text-gray-300 font-medium">{title}</p>
      {description && <p className="text-gray-500 text-sm">{description}</p>}
    </div>
  );
}
