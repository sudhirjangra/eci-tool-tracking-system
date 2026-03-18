import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Search, MapPin } from 'lucide-react';

export default function ConstituencyList() {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch data using TanStack Query
  const { data: constituencies, isLoading, error } = useQuery({
    queryKey: ['constituencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('constituencies')
        .select(`
          id,
          eci_name,
          tool_name,
          states (name),
          assigned_tl_id,
          assigned_ra_id
        `)
        .order('id', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-indigo-600 font-medium">Loading 1,000+ constituencies...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error loading data: {error.message}</div>;
  }

  // Filter based on search input (checks both ECI and Tool names)
  const filteredData = constituencies?.filter(c => 
    c.eci_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.tool_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.states?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div className="relative w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search by constituency or state..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="text-sm text-gray-500 font-medium">
          Showing {filteredData?.length} of {constituencies?.length}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ECI Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tool Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned TL</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned RA</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredData?.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center gap-2">
                  <MapPin size={16} className="text-gray-400"/>
                  {row.states?.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.eci_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.tool_name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {row.assigned_tl_id ? (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Assigned</span>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Unassigned</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {row.assigned_ra_id ? 'Assigned' : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredData?.length === 0 && (
            <div className="p-8 text-center text-gray-500">No constituencies found matching "{searchTerm}"</div>
        )}
      </div>
    </div>
  );
}