function TestApp() {
  return `
    <div style="width: 100%; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f4c75 0%, #2a6fa6 50%, #00a86b 100%); font-family: Arial; color: white;">
      <h1>LOGIN TEST - REACT IS WORKING!</h1>
      <p>If you see this, React successfully rendered this component.</p>
      <form style="margin-top: 20px; background: white; padding: 20px; border-radius: 8px; color: black;">
        <div style="margin-bottom: 10px;">
          <label>Email: <input type="email" style="width: 200px; padding: 5px;" /></label>
        </div>
        <div style="margin-bottom: 10px;">
          <label>Password: <input type="password" style="width: 200px; padding: 5px;" /></label>
        </div>
        <button type="button" style="padding: 10px 20px; background: #0f4c75; color: white; border: none; border-radius: 4px; cursor: pointer;">Sign In</button>
      </form>
    </div>
  `;
}

// Export as both default and named export for flexibility
export default TestApp;
