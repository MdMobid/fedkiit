"use client";

import Login from '../../../authentication/Login/Login';

// No wrapper div: this sat directly inside `.authpage`, whose `align-items:
// center` sized it shrink-to-fit, and everything below inherited that collapsed
// width. Login renders its own full-width shell.
const LoginMain = () => {
  return <Login />;
};

export default LoginMain