<script>
import StandardTaskGrid from "../components/grids/StandardTaskGrid.vue";
import ValueDataField from "../components/fields/ValueDataField.vue";
import SignalDataField from "../components/fields/SignalDataField.vue";
import BadgeDataField from "../components/fields/BadgeDataField.vue";
import TypeDataField from "../components/fields/TypeDataField.vue";
import ComposedDataField from "../components/fields/ComposedDataField.vue";
import AttachmentsDataField from "../components/fields/AttachmentsDataField.vue";
import LinkDataField from "../components/fields/LinkDataField.vue";
import CheckBoxDataField from "../components/fields/CheckBoxDataField.vue";
import ExpandDataField from "../components/fields/ExpandDataField.vue";
import QuantityDataField from "../components/fields/QuantityDataField.vue";
export default {
    props: ['task', 'gridState'],
    data() {
        return {
            showChildren: true
        }
    },
    components : {
        StandardTaskGrid,
        ValueDataField,
        SignalDataField,
        BadgeDataField,
        TypeDataField,
        ComposedDataField,
        AttachmentsDataField,
        LinkDataField,
        ExpandDataField,
        QuantityDataField,
        CheckBoxDataField
    },
    computed: {
        childTaskGrid() {
            let configGrid = this.getConfig(this.task).child_taskgrid || 'standard';
            return configGrid + '-task-grid';
        }
    },
    methods: {
      getTaskRow(task) {
        if(this.config.tasktypes[task.tasktype]){
          return this.config.tasktypes[task.tasktype].taskrow;
        }
        return this.config.tasktypes.default.taskrow;
      },
      getConfig(task){
        if(this.config.tasktypes[task.tasktype]){
          return this.config.tasktypes[task.tasktype];
        }
        return this.config.tasktypes.default;
      },
      hasChildren(task){
          return task.children && (task.children.length > 0) && (task.children[0] != "");
      },
      getChildTasks(task){
          return task.children;
      }
    }
};
</script>

<style lang="sass">
.task-row {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    flex-grow: 0;
    width:100%;
}
</style>
