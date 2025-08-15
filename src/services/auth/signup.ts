import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

type SignupPayload = {
  name: string;
  email: string;
  password: string;
};

// Define the expected response from the API
type SignupResponse = {
    id: string;
    email: string;
    name: string;
    role: string;
};

export const useSignupMutation = () => {
  return useMutation<SignupResponse, Error, SignupPayload>({
    mutationFn: async (signupData: SignupPayload) => {
      try {
        const { data } = await axios.post<SignupResponse>('/api/auth/register', signupData, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        // Ensure the response is in the expected format
        if (data && data.id && data.role) {
          return data;
        } else {
          throw new Error('Invalid response from the server');
        }
      } catch (error: any) {
        // Provide a more informative error message
        if (axios.isAxiosError(error)) {
          // Handle error from Axios
          if (error.response && error.response.data) {
            // Axios error with detailed response from server
            throw new Error(error.response.data.error || 'Signup failed');
          } else {
            throw new Error('Network or Axios error occurred');
          }
        } else {
          // Handle other types of errors (e.g., unexpected errors)
          throw new Error(error.message || 'Signup failed');
        }
      }
    },
    onError: (error: Error) => {
      // Log the error and display it to the user (you can also implement custom error handling)
      console.error('Signup failed', error.message);
    },
  });
};
