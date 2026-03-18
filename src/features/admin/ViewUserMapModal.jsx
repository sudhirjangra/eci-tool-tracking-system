import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, MapPin, Layers } from 'lucide-react';

export default function ViewUserMapModal({ isOpen, onClose, user }) {
  const { data: territories, isLoading } = useQuery({
    queryKey: ['view-user-map', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // If it's a TL, search by assigned_tl_id. If RA, search by assigned_ra_id.
      const column = user.role === 'tl' ? 'assigned_tl_id' : 'assigned_ra_id';
      
      const { data, error } = await supabase
        .from('constituencies')
        .select(`id, eci_name, states(name)`)
        .eq(column, user.id)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && isOpen,
  });

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
        
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <MapPin className={user.role === 'tl' ? 'text-indigo-600' : 'text-emerald-600'} size={20} /> 
              Assigned Territories
            </h3>
            <p className="text-sm text-slate-500 mt-1">Viewing map for <span className="font-bold uppercase text-xs">{user.role}</span>: <span className="font-bold text-slate-800">{user.email}</span></p>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-100 text-slate-500"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500 font-medium animate-pulse">Loading Map Data...</div>
          ) : territories?.length === 0 ? (
            <div className="text-center py-12 text-slate-500 font-medium">
              <Layers size={48} className="mx-auto text-slate-300 mb-4" />
              This user has no assigned territories.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {territories?.map(t => (
                <div key={t.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm flex items-center justify-between">
                  <span className="font-bold text-slate-800">{t.eci_name}</span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">{t.states?.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}