import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

// Define the expected request payload type
type LoginPayload = {
  email: string;
  password: string;
};

// Define the expected response from the API
type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

export const useLoginMutation = () => {
  return useMutation<LoginResponse, Error, LoginPayload>({
    mutationFn: async (loginData: LoginPayload) => {
      const { data } = await axios.post<LoginResponse>('/api/auth/login', loginData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return data;
    },
    onError: (error: Error) => {
      console.error('Login failed', error);
    },
  });
};