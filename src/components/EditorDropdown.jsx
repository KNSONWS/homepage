import { FaUserPlus } from 'react-icons/fa6'
import { useEmployees } from '../hooks/useEmployees'

export default function EditorDropdown({ value, onChange }) {
  const { employees } = useEmployees()
  
  // Finde den zugewiesenen Mitarbeiter anhand der userId
  const assignedEmployee = employees.find(emp => emp.userId === value)
  
  // Zeige Kürzel wenn zugewiesen, sonst Icon
  const displayValue = assignedEmployee?.shortcode || <FaUserPlus size={20} />
  
  return (
    <div className="dropdown">
      <button className="btn" style={{ background: 'inherit', color: 'inherit' }}>
        {displayValue}
      </button>
      <div className="dropdown-content">
        <span 
          className="dropdown-item"
          onClick={() => onChange('')}
        >
          <em>(Unassigned)</em>
        </span>
        {employees.map(employee => (
          <span 
            key={employee.$id}
            className="dropdown-item"
            onClick={() => onChange(employee.userId)}
          >
            {employee.displayName}{employee.shortcode ? ` (${employee.shortcode})` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
