<script>
import ValueDataField from "../components/Standard/ValueDataField.vue";
import SignalDataField from "../components/Standard/SignalDataField.vue";
import BadgeDataField from "../components/Standard/BadgeDataField.vue";
import TypeDataField from "../components/Standard/TypeDataField.vue";
import ComposedDataField from "../components/Standard/ComposedDataField.vue";
import AttachmentsDataField from "../components/Standard/AttachmentsDataField.vue";
import LinkDataField from "../components/Standard/LinkDataField.vue";
import CheckBoxDataField from "../components/Standard/CheckBoxDataField.vue";
import ExpandDataField from "../components/Standard/ExpandDataField.vue";
import QuantityDataField from "../components/Standard/QuantityDataField.vue";
export default {
    name: 'task-row-mixin',
    props: ['task', 'gridState'],
    components : {
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
