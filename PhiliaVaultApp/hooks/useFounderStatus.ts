import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore'; 

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
        // Remplacer par votre vraie URL d'API
        const response = await fetch(`https://philiavault.com/api/user/founder-status?email=${encodeURIComponent(user.email)}`);
        
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
