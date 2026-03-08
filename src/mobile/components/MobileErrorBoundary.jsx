import { Component } from 'react';

class MobileErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '60vh', padding: '24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😵</div>
          <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>Đã xảy ra lỗi</h3>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
            Vui lòng thử lại hoặc quay về trang chính
          </p>
          <button onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '12px 24px', borderRadius: '10px', border: 'none',
              background: '#15803d', color: 'white', fontWeight: 600, fontSize: '15px'
            }}>
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default MobileErrorBoundary;
