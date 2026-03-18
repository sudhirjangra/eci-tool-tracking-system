import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, Save, AlertCircle, MapPin, CheckSquare, Square } from 'lucide-react';

export default function AssignMapModal({ isOpen, onClose, tl, onSuccess }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeState, setActiveState] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const { data: constituencies, isLoading } = useQuery({
    queryKey: ['assignable-constituencies', tl?.id],
    queryFn: async () => {
      if (!tl?.id) return [];
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, eci_name, states(name), assigned_tl_id`)
        .or(`assigned_tl_id.is.null,assigned_tl_id.eq.${tl.id}`)
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tl?.id && isOpen, 
  });

  // Extract unique states and set the first one as active on load
  const uniqueStates = useMemo(() => {
    if (!constituencies) return [];
    const states = [...new Set(constituencies.map(c => c.states?.name).filter(Boolean))].sort();
    if (states.length > 0 && !activeState) setActiveState(states[0]);
    return states;
  }, [constituencies]);

  // Pre-check owned boxes
  useEffect(() => {
    if (constituencies) {
      const alreadyAssigned = constituencies.filter(c => c.assigned_tl_id === tl.id).map(c => c.id);
      setSelectedIds(new Set(alreadyAssigned));
    }
  }, [constituencies, tl?.id]);

  if (!isOpen || !tl) return null;

  // Filter constituencies by the currently active State tab
  const activeConstituencies = constituencies?.filter(c => c.states?.name === activeState) || [];

  const handleToggle = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleToggleAllInState = () => {
    const stateIds = activeConstituencies.map(c => c.id);
    const allSelected = stateIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    
    if (allSelected) {
      stateIds.forEach(id => next.delete(id)); // Deselect all in this state
    } else {
      stateIds.forEach(id => next.add(id)); // Select all in this state
    }
    setSelectedIds(next);
  };

  const handleSave = async () => {
    setIsSaving(true); setError(null);
    const originalIds = new Set(constituencies.filter(c => c.assigned_tl_id === tl.id).map(c => c.id));
    const idsToAssign = [...selectedIds].filter(id => !originalIds.has(id));
    const idsToUnassign = [...originalIds].filter(id => !selectedIds.has(id));

    try {
      if (idsToAssign.length > 0) {
        const { error } = await supabase.from('constituencies').update({ assigned_tl_id: tl.id }).in('id', idsToAssign);
        if (error) throw error;
      }
      if (idsToUnassign.length > 0) {
        const { error } = await supabase.from('constituencies').update({ assigned_tl_id: null }).in('id', idsToUnassign);
        if (error) throw error;
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const isCurrentStateFullySelected = activeConstituencies.length > 0 && activeConstituencies.every(c => selectedIds.has(c.id));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-[#F8FAFC] rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col h-[85vh] border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-200 bg-white flex justify-between items-center z-10">
          <div>
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="text-blue-600" /> Map Assignment Builder
            </h3>
            <p className="text-sm text-slate-500 mt-1">Configuring territory for: <span className="font-bold text-slate-800">{tl.email}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* State Selection Bar (Horizontal Scroll) */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex gap-2 overflow-x-auto items-center shadow-sm z-10 hide-scrollbar">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0">Filter by State:</span>
          {uniqueStates.map(state => (
            <button
              key={state}
              onClick={() => setActiveState(state)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeState === state 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {state}
            </button>
          ))}
        </div>

        {/* Grid Area */}
        {/* 3-Column Grid with Explicit Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeConstituencies.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const isOwnedByMe = c.assigned_tl_id === tl.id;

                  return (
                    <div 
                      key={c.id} 
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-[1.02]' 
                          : 'bg-white border-slate-200 hover:shadow-md'
                      }`}
                    >
                      <div>
                        <h5 className={`font-bold text-lg ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>{c.eci_name}</h5>
                        <span className={`text-xs font-semibold mt-2 inline-block px-2.5 py-1 rounded-md ${
                          isOwnedByMe ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {isOwnedByMe ? 'Currently Assigned to this TL' : 'Unassigned'}
                        </span>
                      </div>
                      
                      {/* Explicit Action Button */}
                      <button 
                        onClick={() => handleToggle(c.id)}
                        className={`mt-5 w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                          isSelected 
                            ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' 
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isSelected ? <><CheckSquare size={16}/> Selected</> : <><Square size={16}/> Select Constituency</>}
                      </button>
                    </div>
                  );
                })}
                {activeConstituencies.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-400 font-medium">No constituencies available for this state.</div>
                )}
              </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-between items-center z-10 shrink-0">
          <div className="text-slate-600 font-medium bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
            Total Selected Globally: <span className="font-bold text-blue-700 text-lg ml-1">{selectedIds.size}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={isSaving} className="px-8 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Save size={18} /> {isSaving ? 'Applying Maps...' : 'Confirm Assignments'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}