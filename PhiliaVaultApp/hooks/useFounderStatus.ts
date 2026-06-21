import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore'; 
import { API_BASE } from '../constants/api';

export const useFounderStatus = () => {
  const { user } = useAuthStore();
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFounder = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/user/founder-status?email=${encodeURIComponent(user.email)}`);
        
        if (response.ok) {
          const data = await response.json();
          setIsFounder(data.isFounder === true);
        }
      } catch (error) {
        console.error('[FounderCheck] Erreur:', error);
      } finally {
        setLoading(false);
      }
    };

    checkFounder();
  }, [user]);

  return { isFounder, loading };
};
