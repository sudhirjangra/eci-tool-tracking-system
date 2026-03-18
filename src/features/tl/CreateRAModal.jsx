import { useState } from 'react';
import { supabase, supabaseAdminAuth } from '../../lib/supabase';
import { X, UserPlus, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function CreateRAModal({ isOpen, onClose, onSuccess, tlId }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleCreateRA = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // 1. Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdminAuth.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Add them to user_roles as an RA managed by this TL
    if (authData?.user) {
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          id: authData.user.id,
          role: 'ra',
          manager_id: tlId, // Lock them to this specific Team Leader
        });

      if (roleError) {
        setError('Account created, but failed to assign RA role: ' + roleError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);
      setEmail('');
      setPassword('');
      if (onSuccess) onSuccess();
      
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus size={20} className="text-emerald-600" />
            Create Research Analyst
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateRA} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex gap-2 items-start">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex gap-2 items-start">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>RA created successfully!</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="email" required className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="ra.name@election2026.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="password" required minLength={6} className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500" placeholder="Minimum 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
            <button type="submit" disabled={loading || success} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}