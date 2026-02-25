import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  linkSource: string | null;
  onCancel: () => void;
}

export default function FloorPlanLinkBanner({ linkSource, onCancel }: Props) {
  return (
    <div className="mb-4 px-4 py-3 bg-burgundy/[0.06] border border-burgundy/20 rounded-xl flex items-center gap-3">
      <span style={{ color: '#9F1239' }}>
        <ThiingsIcon name="link" pxSize={16} />
      </span>
      <span className="text-sm text-burgundy font-medium">
        {linkSource
          ? 'Click another table to link or unlink it'
          : 'Click the first table to start linking'}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto text-xs text-burgundy/70 hover:text-burgundy font-medium hover:underline transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
