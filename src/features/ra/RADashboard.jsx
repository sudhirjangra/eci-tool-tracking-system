import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Map, LogOut, Clock, Activity } from 'lucide-react';

export default function RADashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user));
  }, []);

  // Fetch constituencies, auto-refreshing every 10 seconds for live tracking!
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['ra-assignments', currentUser?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('constituencies')
        .select(`
          id, 
          eci_name, 
          tool_name, 
          states(name),
          election_data (
            eci_round, tool_round, last_updated_at
          )
        `)
        .eq('assigned_ra_id', currentUser.id)
        .order('states(name)', { ascending: true })
        .order('eci_name', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!currentUser?.id,
    refetchInterval: 10000, // MAGIC: Auto-refreshes data every 10 seconds
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Waiting for data...';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Helper function to visually show if the tool is lagging behind ECI
  const getSyncStatus = (eci, tool) => {
    if (eci === 0 && tool === 0) return { label: 'Not Started', color: 'bg-gray-100 text-gray-800' };
    if (tool < eci) return { label: 'Tool Lagging', color: 'bg-red-100 text-red-800' };
    if (tool > eci) return { label: 'Tool Ahead', color: 'bg-orange-100 text-orange-800' };
    return { label: 'In Sync', color: 'bg-green-100 text-green-800' };
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', backgroundColor: '#f1f5f9', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: '256px', backgroundColor: '#000f1a', color: 'white', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', zIndex: 10 }}>
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold tracking-wider text-blue-400">ELECTION '26</h1>
          <p className="text-slate-400 text-sm mt-1">Analyst Tracker</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-blue-600 text-white shadow-sm transition-colors">
            <Activity size={20} />
            <span className="font-medium">Live Feed</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', width: '100%' }}>
        <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #cbd5e1', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-800">Live Round Tracking</h2>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              Auto-updating
            </div>
          </div>
          <div className="flex items-center gap-3">
             <span className="text-sm font-medium text-slate-500">{currentUser?.email}</span>
             <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold border border-blue-200">RA</div>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '2rem', width: '100%' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-medium text-slate-900">
                Monitored Territories ({assignments?.length || 0})
              </h3>
            </div>
            
            <div style={{ overflow: 'auto', flex: 1 }}>
              {isLoading ? (
                <div className="p-12 text-center text-blue-600 font-medium">Connecting to live feed...</div>
              ) : assignments?.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Map size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-700">No Assignments Yet</p>
                  <p className="text-sm mt-1">Waiting for your Team Leader to delegate territories to you.</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">ECI Name</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">ECI Rnd</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Tool Rnd</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {assignments?.map((row) => {
                      const data = row.election_data?.[0] || { eci_round: 0, tool_round: 0 };
                      const status = getSyncStatus(data.eci_round, data.tool_round);
                      
                      return (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{row.eci_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{row.states?.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-mono font-bold text-slate-800 bg-slate-50/50">{data.eci_round}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-mono font-bold text-blue-700 bg-blue-50/50">{data.tool_round}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center mt-1">
                             <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${status.color}`}>
                               {status.label}
                             </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 flex items-center justify-end gap-2 mt-1">
                            <Clock size={14} className="text-slate-400" />
                            {formatTime(data.last_updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}