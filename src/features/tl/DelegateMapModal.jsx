import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, Search, Map, Save, AlertCircle } from 'lucide-react';

export default function DelegateMapModal({ isOpen, onClose, ra, tlId, onSuccess }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch ONLY the constituencies that the current Team Leader owns
  const { data: constituencies, isLoading } = useQuery({
    queryKey: ['tl-delegation-map', tlId],
    queryFn: async () => {
      if (!tlId) return [];
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, eci_name, states(name), assigned_ra_id`)
        .eq('assigned_tl_id', tlId) // STRICT SECURITY: Only their own map
        .order('id', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!tlId && isOpen, 
  });

  // Pre-check the boxes for constituencies this specific RA already owns
  useEffect(() => {
    if (constituencies && ra) {
      const alreadyAssigned = constituencies
        .filter(c => c.assigned_ra_id === ra.id)
        .map(c => c.id);
      setSelectedIds(new Set(alreadyAssigned));
    }
  }, [constituencies, ra?.id]);

  if (!isOpen || !ra) return null;

  const handleToggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    const originalIds = new Set(constituencies.filter(c => c.assigned_ra_id === ra.id).map(c => c.id));
    const idsToAssign = [...selectedIds].filter(id => !originalIds.has(id));
    const idsToUnassign = [...originalIds].filter(id => !selectedIds.has(id));

    try {
      // 1. Assign new constituencies to this RA
      if (idsToAssign.length > 0) {
        const { error: assignError } = await supabase
          .from('constituencies')
          .update({ assigned_ra_id: ra.id })
          .in('id', idsToAssign);
        if (assignError) throw assignError;
      }

      // 2. Unassign removed ones (They go back into the TL's general pool)
      if (idsToUnassign.length > 0) {
        const { error: unassignError } = await supabase
          .from('constituencies')
          .update({ assigned_ra_id: null })
          .in('id', idsToUnassign);
        if (unassignError) throw unassignError;
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredData = constituencies?.filter(c => 
    c.eci_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.states?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Map size={20} className="text-emerald-600" />
              Delegate Territories
            </h3>
            <p className="text-sm text-gray-500 mt-1">Delegating to RA: <span className="font-semibold text-gray-800">{ra.email}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200 bg-white space-y-3 shrink-0">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex gap-2 items-start">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search your assigned territories..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-sm font-medium text-emerald-700 bg-emerald-50 px-4 py-2 rounded-lg border border-emerald-100">
              {selectedIds.size} Selected
            </div>
          </div>
        </div>

        {/* Scrollable Table Area */}
        <div className="flex-1 overflow-y-auto bg-white">
          {isLoading ? (
            <div className="flex justify-center p-8 text-emerald-600 font-medium">Loading your territories...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">Select</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ECI Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData?.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const isAssignedToThisRA = c.assigned_ra_id === ra.id;
                  const isAssignedToOtherRA = c.assigned_ra_id !== null && c.assigned_ra_id !== ra.id;
                  
                  return (
                    <tr 
                      key={c.id} 
                      onClick={() => handleToggle(c.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer pointer-events-none"
                          checked={isSelected}
                          readOnly
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.eci_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.states?.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {isAssignedToThisRA ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Assigned Here</span>
                        ) : isAssignedToOtherRA ? (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">With Another RA</span>
                        ) : (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 shrink-0 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 font-medium">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-2 disabled:opacity-50">
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Delegation'}
          </button>
        </div>
      </div>
    </div>
  );
}