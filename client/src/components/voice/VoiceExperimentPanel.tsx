import {
  useVoiceExperiment,
  usePromoteExperiment,
  useRollbackExperiment,
} from '../../hooks/useVoiceExperiment';

export default function VoiceExperimentPanel() {
  const { data: experiment, isLoading } = useVoiceExperiment();
  const promoteMutation = usePromoteExperiment();
  const rollbackMutation = useRollbackExperiment();

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />;
  }

  // Completed or promoted experiment
  if (experiment && (experiment.status === 'completed' || experiment.status === 'promoted')) {
    const winner = experiment.result?.winner === 'variant' ? 'Variant' : 'Control';
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">A/B Test Result</h3>
        <p className="text-sm text-gray-600 mb-2">
          Experiment <span className="font-medium">{experiment.branch_name}</span> has ended.
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Winner: <span className="font-semibold">{winner}</span>
        </p>
        <button
          onClick={() => {}}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          Start New Experiment
        </button>
      </div>
    );
  }

  // Running experiment
  if (experiment && experiment.status === 'running') {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">Running Experiment</h3>
        <p className="text-sm text-gray-600 mb-1">
          <span className="font-medium">{experiment.branch_name}</span>
        </p>
        <p className="text-sm text-gray-500 mb-3">
          Traffic split: {experiment.traffic_split}% variant
        </p>
        <div className="flex gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{experiment.control_count ?? '-'}</p>
            <p className="text-xs text-gray-500">Control</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{experiment.variant_count ?? '-'}</p>
            <p className="text-xs text-gray-500">Variant</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => promoteMutation.mutate()}
            disabled={promoteMutation.isPending}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm hover:bg-rose-700 disabled:opacity-50"
          >
            Promote
          </button>
          <button
            onClick={() => rollbackMutation.mutate()}
            disabled={rollbackMutation.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            Roll Back
          </button>
        </div>
      </div>
    );
  }

  // No experiment
  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-2">A/B Test Your Voice</h3>
      <p className="text-sm text-gray-600 mb-4">
        Test different voice configurations to find the best fit for your restaurant.
      </p>
      <button
        onClick={() => {}}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
      >
        Create Experiment
      </button>
    </div>
  );
}
